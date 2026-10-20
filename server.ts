import express from "express";
import { createServer as createViteServer } from "vite";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import multer from "multer";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import os from "os";
import { execFile, execSync } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { commandSystemPrompt } from "./src/editor/commandSpec";
import { autoEditSystemPrompt, reviewSystemPrompt } from "./src/editor/autoEditSpec";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

dotenv.config();

// Register custom fonts in a writable temporary directory for libass / FFmpeg.
// Published VMs do not allow writing to /usr/local/share/fonts.
try {
  const fontSrcDir = path.join(process.cwd(), "fonts");
  const fontDestDir = path.join(os.tmpdir(), "viral_captions_fonts");
  if (fs.existsSync(fontSrcDir)) {
    if (!fs.existsSync(fontDestDir)) {
      fs.mkdirSync(fontDestDir, { recursive: true });
    }
    const files = fs.readdirSync(fontSrcDir);
    for (const file of files) {
      if (file.endsWith(".ttf") || file.endsWith(".otf")) {
        fs.copyFileSync(path.join(fontSrcDir, file), path.join(fontDestDir, file));
      }
    }
    execSync(`fc-cache -f "${fontDestDir}"`, { stdio: "ignore" });
    console.log("System fonts registered and cached successfully for FFmpeg/libass.");
  }
} catch (fontErr) {
  console.warn("Font registration check completed:", fontErr);
}

// Safe derivation of directory path for both tsx (ESM) and esbuild CJS bundle
const currentDirname = typeof __dirname !== "undefined" ? __dirname : process.cwd();
const projectRoot = fs.existsSync(path.join(process.cwd(), "src/remotion/entry.ts"))
  ? process.cwd()
  : currentDirname;
const fasterWhisperScriptPath = fs.existsSync(path.join(process.cwd(), "scripts/transcribe_faster_whisper.py"))
  ? path.join(process.cwd(), "scripts/transcribe_faster_whisper.py")
  : path.join(currentDirname, "../scripts/transcribe_faster_whisper.py");
const pythonExecutable = process.env.PYTHON_BIN ||
  (fs.existsSync(path.join(process.cwd(), ".pythonlibs/bin/python"))
    ? path.join(process.cwd(), ".pythonlibs/bin/python")
    : "python");
let remotionBundlePromise: Promise<string> | null = null;

const getRemotionBundle = () => {
  if (!remotionBundlePromise) {
    remotionBundlePromise = bundle({
      entryPoint: path.join(projectRoot, "src/remotion/entry.ts"),
    });
  }
  return remotionBundlePromise;
};

// OpenRouter uses the OpenAI-compatible API and keeps provider/model selection configurable.
const getOpenRouterClient = () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === "MY_OPENROUTER_API_KEY") return null;
  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.APP_URL || "https://replit.com",
      "X-Title": "AI Video Captioner",
    },
  });
};

type TranscribedWord = {
  word: string;
  start: number;
  end: number;
};

const transcribeWithFasterWhisper = (audioPath: string): Promise<TranscribedWord[]> =>
  new Promise((resolve, reject) => {
    execFile(
      pythonExecutable,
      [fasterWhisperScriptPath, audioPath],
      {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300000,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }

        try {
          const output = JSON.parse(stdout.trim());
          if (output.error || !Array.isArray(output.words)) {
            throw new Error(output.error || "لم يعطِ faster-whisper توقيتات كلمات صالحة.");
          }

          resolve(output.words
            .filter((word: any) =>
              word &&
              typeof word.word === "string" &&
              Number.isFinite(Number(word.start)) &&
              Number.isFinite(Number(word.end))
            )
            .map((word: any) => ({
              word: word.word.trim(),
              start: Number(word.start),
              end: Number(word.end),
            }))
            .filter((word: TranscribedWord) => word.word.length > 0));
        } catch (parseError: any) {
          reject(new Error(`تعذر قراءة نتيجة faster-whisper: ${parseError.message}`));
        }
      },
    );
  });

type SpeechBounds = {
  start: number;
  end: number;
};

/**
 * Gemini can return a word timeline that starts correctly but slowly drifts
 * from the source audio. Use the actual non-silent audio envelope as the
 * stable time base before sending timestamps to the editor.
 */
const detectSpeechBounds = (audioPath: string, duration: number): Promise<SpeechBounds> =>
  new Promise((resolve) => {
    execFile(
      ffmpegInstaller.path,
      [
        "-hide_banner",
        "-i", audioPath,
        "-af", "silencedetect=noise=-35dB:d=0.12",
        "-f", "null",
        "-"
      ],
      { maxBuffer: 1024 * 1024 },
      (_error, _stdout, stderr) => {
        const silenceStarts = Array.from(stderr.matchAll(/silence_start:\s*([0-9.]+)/g))
          .map((match) => Number(match[1]))
          .filter(Number.isFinite);
        const silenceEnds = Array.from(stderr.matchAll(/silence_end:\s*([0-9.]+)/g))
          .map((match) => Number(match[1]))
          .filter(Number.isFinite);

        const firstStart = silenceStarts[0];
        const firstEnd = silenceEnds[0];
        const speechStart = firstStart !== undefined && firstStart <= 0.05
          ? Math.min(duration, firstEnd ?? 0)
          : 0;

        const lastStart = silenceStarts[silenceStarts.length - 1];
        const lastEnd = silenceEnds[silenceEnds.length - 1];
        const hasTrailingSilence = lastStart !== undefined && (lastEnd === undefined || lastStart > lastEnd);
        const speechEnd = hasTrailingSilence ? Math.max(speechStart, lastStart) : duration;

        resolve({
          start: Math.max(0, Math.min(speechStart, duration)),
          end: Math.max(speechStart, Math.min(speechEnd, duration)),
        });
      },
    );
  });

/**
 * Speech-to-text with acoustic word timestamps through OpenRouter (Whisper).
 * Unlike a chat model, Whisper measures where each word is in the audio.
 */
const transcribeWithOpenRouterWhisper = async (wavPath: string): Promise<TranscribedWord[]> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];
  // FLAC keeps every sample (no encoder padding) at about half the size of WAV.
  const flacPath = wavPath.replace(/\.wav$/, ".flac");
  await new Promise<void>((resolve, reject) =>
    execFile(ffmpegInstaller.path, ["-y", "-i", wavPath, "-c:a", "flac", "-ac", "1", "-ar", "16000", flacPath], (err) => (err ? reject(err) : resolve())),
  );
  try {
    const form = new FormData();
    form.append("file", new Blob([await fs.promises.readFile(flacPath)], { type: "audio/flac" }), "audio.flac");
    form.append("model", process.env.WHISPER_MODEL || "openai/whisper-large-v3");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    const response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.APP_URL || "https://replit.com",
        "X-Title": "AI Video Captioner",
      },
      body: form,
    });
    if (!response.ok) throw new Error(`Whisper ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const data: any = await response.json();
    const raw: any[] = Array.isArray(data.words) && data.words.length ? data.words : (data.segments ?? []).flatMap((seg: any) => seg.words ?? []);
    return raw
      .map((w) => ({ word: String(w.word ?? w.text ?? "").trim(), start: Number(w.start), end: Number(w.end) }))
      .filter((w) => w.word && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start);
  } finally {
    fs.promises.unlink(flacPath).catch(() => {});
  }
};

/** Stretches of speech between pauses (silencedetect), in seconds. */
const detectSpeechSegments = (audioPath: string, duration: number): Promise<SpeechBounds[]> =>
  new Promise((resolve) => {
    execFile(
      ffmpegInstaller.path,
      ["-hide_banner", "-i", audioPath, "-af", "silencedetect=noise=-35dB:d=0.25", "-f", "null", "-"],
      { maxBuffer: 4 * 1024 * 1024 },
      (_error, _stdout, stderr) => {
        const starts = Array.from(stderr.matchAll(/silence_start:\s*([0-9.]+)/g)).map((m) => Number(m[1]));
        const ends = Array.from(stderr.matchAll(/silence_end:\s*([0-9.]+)/g)).map((m) => Number(m[1]));
        const segments: SpeechBounds[] = [];
        let cursor = 0;
        starts.forEach((silenceStart, i) => {
          if (silenceStart - cursor > 0.08) segments.push({ start: cursor, end: silenceStart });
          cursor = ends[i] ?? duration;
        });
        if (duration - cursor > 0.08) segments.push({ start: cursor, end: duration });
        resolve(segments);
      },
    );
  });

/**
 * Pins a chat model's estimated word times to the real speech: each word joins
 * the stretch of speech its time falls in (keeping order), and each stretch's
 * words are spread over it with their original rhythm. Drift can't build up
 * past a pause. Skipped when the audio has no clear pauses (music under speech).
 */
const alignToSpeech = (words: TranscribedWord[], segments: SpeechBounds[], duration: number): TranscribedWord[] => {
  if (words.length < 2 || segments.length < 2) return words;
  const speech = segments.reduce((s, g) => s + g.end - g.start, 0);
  if (segments.some((g) => g.end - g.start > Math.max(20, speech * 0.6))) return words;
  // Assign words to stretches with dynamic programming: each stretch should hold
  // about as many letters as its length allows at the speaker's pace, and words
  // should stay near their estimated times. Order is always kept.
  const n = words.length;
  const m = segments.length;
  const weight = words.map((w) => Math.max(1, Array.from(w.word).length));
  const prefix = [0];
  weight.forEach((w) => prefix.push(prefix[prefix.length - 1] + w));
  const rate = prefix[n] / speech;
  const mid = words.map((w) => (w.start + w.end) / 2);
  const dist = (t: number, g: SpeechBounds) => (t < g.start ? g.start - t : t > g.end ? t - g.end : 0);
  const fill = (letters: number, g: SpeechBounds) => {
    const expected = rate * (g.end - g.start);
    return ((letters - expected) * (letters - expected)) / (expected + 2);
  };
  const MAX_GROUP = 80;
  const groups = new Map<number, TranscribedWord[]>();
  if (n * m <= 400000) {
    // dp[j][i]: best cost placing the first i words in the first j stretches.
    const dp = Array.from({ length: m + 1 }, () => new Float64Array(n + 1).fill(Infinity));
    const from = Array.from({ length: m + 1 }, () => new Int32Array(n + 1).fill(-1));
    dp[0][0] = 0;
    for (let j = 0; j < m; j++) {
      const g = segments[j];
      for (let i = 0; i <= n; i++) {
        // Stretch j left without words (noise, music).
        const skip = dp[j][i] + fill(0, g);
        if (skip < dp[j + 1][i]) {
          dp[j + 1][i] = skip;
          from[j + 1][i] = i;
        }
        let timeCost = 0;
        for (let k = i - 1; k >= Math.max(0, i - MAX_GROUP); k--) {
          timeCost += dist(mid[k], g) * 3;
          if (dp[j][k] === Infinity) continue;
          const c = dp[j][k] + fill(prefix[i] - prefix[k], g) + timeCost;
          if (c < dp[j + 1][i]) {
            dp[j + 1][i] = c;
            from[j + 1][i] = k;
          }
        }
      }
    }
    if (dp[m][n] < Infinity) {
      let i = n;
      for (let j = m; j > 0; j--) {
        const k = from[j][i];
        if (k < i) groups.set(j - 1, words.slice(k, i));
        i = k;
      }
    }
  }
  if (!groups.size) {
    // Very long transcripts: nearest stretch, in order.
    let last = 0;
    for (const w of words) {
      let best = last;
      for (let j = last; j < m; j++) if (dist((w.start + w.end) / 2, segments[j]) < dist((w.start + w.end) / 2, segments[best])) best = j;
      last = best;
      groups.set(best, [...(groups.get(best) ?? []), w]);
    }
  }
  const out: TranscribedWord[] = [];
  for (const [i, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const g = segments[i];
    const from = group[0].start;
    const to = group[group.length - 1].end;
    const span = to - from;
    const weights = group.map((w) => Math.max(1, Array.from(w.word).length));
    const total = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    group.forEach((w, k) => {
      let start: number;
      let end: number;
      if (span > 0.15) {
        // Keep the model's rhythm inside the stretch, rescaled to its real bounds.
        start = g.start + ((w.start - from) / span) * (g.end - g.start);
        end = g.start + ((w.end - from) / span) * (g.end - g.start);
      } else {
        start = g.start + (acc / total) * (g.end - g.start);
        end = g.start + ((acc + weights[k]) / total) * (g.end - g.start);
      }
      acc += weights[k];
      out.push({ ...w, start: Math.min(duration, Math.max(0, start)), end: Math.min(duration, Math.max(start, end)) });
    });
  }
  return out;
};

const calibrateWordTimeline = (
  words: Array<{ word: string; start: number; end: number }>,
  speechBounds: SpeechBounds,
  duration: number,
) => {
  if (words.length < 2 || speechBounds.end <= speechBounds.start) return words;

  const firstWord = words[0];
  const lastWord = words[words.length - 1];
  const sourceStart = Math.max(0, Math.min(firstWord.start, duration));
  const sourceEnd = Math.max(sourceStart, Math.min(lastWord.end, duration));
  const sourceSpan = sourceEnd - sourceStart;
  const targetSpan = speechBounds.end - speechBounds.start;

  if (sourceSpan <= 0.1 || targetSpan <= 0.1) return words;

  const scale = targetSpan / sourceSpan;
  // Avoid changing a good transcript for insignificant differences.
  if (Math.abs(scale - 1) < 0.02 && Math.abs(sourceStart - speechBounds.start) < 0.08) {
    return words;
  }

  console.log(
    `Calibrating word timeline: ${sourceSpan.toFixed(3)}s -> ${targetSpan.toFixed(3)}s ` +
    `(scale ${scale.toFixed(4)})`,
  );

  return words.map((word) => ({
    ...word,
    start: Math.max(0, Math.min(duration, speechBounds.start + (word.start - sourceStart) * scale)),
    end: Math.max(0, Math.min(duration, speechBounds.start + (word.end - sourceStart) * scale)),
  }));
};

// In-memory / temporary storage registry for active video sessions
const STORAGE_DIR = path.join(os.tmpdir(), "viral_captions_storage");
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Map of videoId -> { filePath: string, originalName: string, timestamp: number }
const videoSessions = new Map<string, { filePath: string; originalName: string; timestamp: number }>();

// Re-index existing videos from STORAGE_DIR on server startup
try {
  if (fs.existsSync(STORAGE_DIR)) {
    const files = fs.readdirSync(STORAGE_DIR);
    for (const file of files) {
      if (file.startsWith("vid_") && !file.includes("_extracted") && !file.includes("_remuxed") && !file.includes("_canvas")) {
        const videoId = file.replace(/\.[^/.]+$/, "");
        const filePath = path.join(STORAGE_DIR, file);
        videoSessions.set(videoId, {
          filePath,
          originalName: file,
          timestamp: Date.now()
        });
      }
    }
    console.log(`Indexed ${videoSessions.size} existing video sessions from disk.`);
  }
} catch (e) {
  console.warn("Storage re-indexing notice:", e);
}

// Clean up old video sessions every 30 minutes (older than 2 hours)
setInterval(() => {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000;
  for (const [id, session] of videoSessions.entries()) {
    if (now - session.timestamp > maxAge) {
      try {
        if (fs.existsSync(session.filePath)) {
          fs.unlinkSync(session.filePath);
        }
      } catch (e) {
        console.error("Session cleanup error:", e);
      }
      videoSessions.delete(id);
    }
  }
}, 30 * 60 * 1000);

async function startServer() {
  const app = express();
  // Render (and most hosts) sit behind one proxy; this makes req.ip the visitor.
  app.set("trust proxy", 1);
  const PORT = Number(process.env.PORT) || 5000;

  app.use(express.json({ limit: "500mb" }));
  app.use(express.urlencoded({ extended: true, limit: "500mb" }));

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Editing commands: turns a natural-language request into editor actions.
  // The system prompt is fixed here so the endpoint can't be used as a general chatbot.
  const commandHits = new Map<string, number[]>();
  app.post("/api/command", async (req, res) => {
    const client = getOpenRouterClient();
    if (!client) {
      return res.status(503).json({ error: "OPENROUTER_API_KEY is not set" });
    }
    const command = typeof req.body?.command === "string" ? req.body.command.trim() : "";
    const context = JSON.stringify(req.body?.context ?? {});
    if (!command || command.length > 600 || context.length > 60_000) {
      return res.status(400).json({ error: "Invalid command" });
    }
    // At most 20 commands a minute per visitor.
    const ip = req.ip || "unknown";
    const now = Date.now();
    const hits = (commandHits.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (hits.length >= 20) return res.status(429).json({ error: "Too many commands" });
    hits.push(now);
    commandHits.set(ip, hits);

    try {
      const response = await client.chat.completions.create({
        model: process.env.COMMAND_MODEL || "google/gemini-2.5-flash",
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: commandSystemPrompt() },
          { role: "user", content: `Project context:\n${context}\n\nCommand: ${command}` },
        ],
      });
      const raw = response.choices[0]?.message?.content ?? "";
      const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
      const parsed = JSON.parse(json);
      res.json({
        reply: typeof parsed.reply === "string" ? parsed.reply : "",
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      });
    } catch (error) {
      console.error("Command failed:", error);
      res.status(502).json({ error: "Command model failed" });
    }
  });

  // Long AI jobs (planning, video analysis) run in the background: the request returns a job id at
  // once and the browser polls it, so a dropped connection (phone screen off, network switch, proxy
  // timeout) doesn't lose the result.
  type Job = { status: "running" | "done" | "error"; result?: unknown; at: number };
  const jobs = new Map<string, Job>();
  const startJob = (run: () => Promise<unknown>) => {
    const now = Date.now();
    for (const [id, j] of jobs) if (now - j.at > 30 * 60_000) jobs.delete(id);
    const id = crypto.randomUUID();
    const job: Job = { status: "running", at: now };
    jobs.set(id, job);
    run()
      .then((result) => Object.assign(job, { status: "done", result }))
      .catch((error) => {
        console.error("Job failed:", error);
        job.status = "error";
      });
    return id;
  };
  app.get("/api/jobs/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Unknown job" });
    if (job.status === "running") return res.status(202).json({ status: "running" });
    if (job.status === "error") return res.status(502).json({ status: "error" });
    res.json({ status: "done", result: job.result });
  });

  // Auto edit: the AI plans a whole video from the analysed footage (and revises the plan on feedback).
  const planHits = new Map<string, number[]>();
  app.post("/api/auto-edit/plan", async (req, res) => {
    const client = getOpenRouterClient();
    if (!client) {
      return res.status(503).json({ error: "OPENROUTER_API_KEY is not set" });
    }
    const brief = JSON.stringify(req.body?.brief ?? {});
    const materials = JSON.stringify(req.body?.materials ?? []);
    const previous = req.body?.previous ? JSON.stringify(req.body.previous) : "";
    const feedback = typeof req.body?.feedback === "string" ? req.body.feedback.trim().slice(0, 600) : "";
    if (brief.length > 3000 || materials.length > 150_000 || previous.length > 30_000) {
      return res.status(400).json({ error: "Invalid request" });
    }
    const ip = req.ip || "unknown";
    const now = Date.now();
    const hits = (planHits.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (hits.length >= 10) return res.status(429).json({ error: "Too many requests" });
    hits.push(now);
    planHits.set(ip, hits);

    const parts = [`Brief:\n${brief}`, `Materials:\n${materials}`];
    if (previous) parts.push(`Your previous plan:\n${previous}`, `The user wants these changes (keep everything else): ${feedback || "improve it"}\nReturn the full updated plan.`);
    const job = startJob(async () => {
      const response = await client.chat.completions.create({
        model: process.env.PLAN_MODEL || "google/gemini-3.8-flash",
        temperature: 0.4,
        max_tokens: 8000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: autoEditSystemPrompt() },
          { role: "user", content: parts.join("\n\n") },
        ],
      });
      const raw = response.choices[0]?.message?.content ?? "";
      return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    });
    res.status(202).json({ job });
  });

  // Caption rewriting (translate, change dialect, fix spelling): lines in, the same number of lines out.
  const rewriteHits = new Map<string, number[]>();
  app.post("/api/caption-rewrite", async (req, res) => {
    const client = getOpenRouterClient();
    if (!client) {
      return res.status(503).json({ error: "OPENROUTER_API_KEY is not set" });
    }
    const lines: unknown = req.body?.lines;
    const instruction = typeof req.body?.instruction === "string" ? req.body.instruction.trim().slice(0, 200) : "";
    if (!instruction || !Array.isArray(lines) || !lines.length || lines.length > 80 || !lines.every((l) => typeof l === "string" && l.length <= 300)) {
      return res.status(400).json({ error: "Invalid request" });
    }
    const ip = req.ip || "unknown";
    const now = Date.now();
    const hits = (rewriteHits.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (hits.length >= 30) return res.status(429).json({ error: "Too many requests" });
    hits.push(now);
    rewriteHits.set(ip, hits);

    try {
      const response = await client.chat.completions.create({
        model: process.env.COMMAND_MODEL || "google/gemini-2.5-flash",
        temperature: 0.2,
        max_tokens: 6000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You rewrite the subtitle lines of a short video. Apply the instruction to every line and keep the meaning. ' +
              'Lines are consecutive parts of one speech, so keep each line\'s content in that line (do not move words between lines) and keep lines about as short. ' +
              'Reply with ONLY {"lines": [...]} containing exactly as many strings as were given, in the same order. Never add anything else.',
          },
          { role: "user", content: `Instruction: ${instruction}\n\nLines (${lines.length}):\n${JSON.stringify(lines)}` },
        ],
      });
      const raw = response.choices[0]?.message?.content ?? "";
      const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      const out = Array.isArray(parsed.lines) ? parsed.lines.map((l: unknown) => (typeof l === "string" ? l.slice(0, 300) : "")) : [];
      res.json({ lines: out });
    } catch (error) {
      console.error("Caption rewrite failed:", error);
      res.status(502).json({ error: "Rewrite failed" });
    }
  });

  // Text to speech through OpenRouter's speech endpoint. Gemini TTS returns raw
  // 24 kHz 16-bit mono PCM, which is wrapped in a WAV header for the browser.
  const ttsHits = new Map<string, number[]>();
  app.post("/api/tts", async (req, res) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || apiKey === "MY_OPENROUTER_API_KEY") {
      return res.status(503).json({ error: "OPENROUTER_API_KEY is not set" });
    }
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const voice = typeof req.body?.voice === "string" && /^[A-Za-z_]{2,40}$/.test(req.body.voice) ? req.body.voice : "Kore";
    const instructions = typeof req.body?.instructions === "string" ? req.body.instructions.slice(0, 300) : "";
    if (!text || text.length > 2000) return res.status(400).json({ error: "Invalid text" });
    const ip = req.ip || "unknown";
    const now = Date.now();
    const hits = (ttsHits.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (hits.length >= 10) return res.status(429).json({ error: "Too many requests" });
    hits.push(now);
    ttsHits.set(ip, hits);

    try {
      const response = await fetch("https://openrouter.ai/api/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_URL || "https://replit.com",
          "X-Title": "AI Video Captioner",
        },
        body: JSON.stringify({
          model: process.env.TTS_MODEL || "google/gemini-3.8-flash-lite-tts",
          input: text,
          voice,
          response_format: "pcm",
          ...(instructions ? { instructions } : {}),
        }),
      });
      if (!response.ok) {
        console.error("TTS failed:", response.status, (await response.text()).slice(0, 500));
        return res.status(502).json({ error: "Speech model failed" });
      }
      const pcm = Buffer.from(await response.arrayBuffer());
      res.setHeader("Content-Type", "audio/wav");
      // Already a WAV file: pass it through.
      if (pcm.subarray(0, 4).toString() === "RIFF") return res.send(pcm);
      const sampleRate = 24000;
      const header = Buffer.alloc(44);
      header.write("RIFF", 0);
      header.writeUInt32LE(36 + pcm.length, 4);
      header.write("WAVE", 8);
      header.write("fmt ", 12);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20); // PCM
      header.writeUInt16LE(1, 22); // mono
      header.writeUInt32LE(sampleRate, 24);
      header.writeUInt32LE(sampleRate * 2, 28);
      header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34);
      header.write("data", 36);
      header.writeUInt32LE(pcm.length, 40);
      res.send(Buffer.concat([header, pcm]));
    } catch (error) {
      console.error("TTS failed:", error);
      res.status(502).json({ error: "Speech model failed" });
    }
  });

  // Sound effects from Freesound, limited to CC0 (no attribution, commercial use allowed).
  // Arabic searches are translated to English keywords first, since Freesound tags are English.
  const sfxHits = new Map<string, number[]>();
  const sfxTranslations = new Map<string, string>();
  const sfxLimited = (req: express.Request, limit: number) => {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const hits = (sfxHits.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (hits.length >= limit) return true;
    hits.push(now);
    sfxHits.set(ip, hits);
    return false;
  };
  const toEnglishKeywords = async (query: string) => {
    if (!/[؀-ۿ]/.test(query)) return query;
    const cached = sfxTranslations.get(query);
    if (cached) return cached;
    const client = getOpenRouterClient();
    if (!client) return query;
    try {
      const response = await client.chat.completions.create({
        model: process.env.COMMAND_MODEL || "google/gemini-2.5-flash",
        temperature: 0,
        max_tokens: 20,
        messages: [
          { role: "system", content: "Translate the sound-effect search into 1-3 English keywords for a sound library. Reply with the keywords only." },
          { role: "user", content: query },
        ],
      });
      const words = (response.choices[0]?.message?.content ?? "").replace(/[^a-zA-Z0-9 -]/g, " ").trim().slice(0, 60);
      if (words) sfxTranslations.set(query, words);
      return words || query;
    } catch {
      return query;
    }
  };

  app.get("/api/sfx/search", async (req, res) => {
    const key = process.env.FREESOUND_API_KEY;
    if (!key) return res.status(503).json({ error: "FREESOUND_API_KEY is not set" });
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    if (!q) return res.status(400).json({ error: "Missing query" });
    if (sfxLimited(req, 30)) return res.status(429).json({ error: "Too many requests" });
    try {
      const query = await toEnglishKeywords(q);
      const url = new URL("https://freesound.org/apiv2/search/text/");
      url.searchParams.set("query", query);
      // Music beds (auto edit) are longer, tagged pieces; effects are short.
      const music = req.query.kind === "music";
      url.searchParams.set("filter", music ? 'license:"Creative Commons 0" duration:[20 TO 600] tag:music' : 'license:"Creative Commons 0" duration:[0 TO 30]');
      if (music) url.searchParams.set("sort", "rating_desc");
      url.searchParams.set("fields", "id,name,duration,username");
      url.searchParams.set("page_size", "24");
      url.searchParams.set("token", key);
      const response = await fetch(url);
      if (!response.ok) {
        console.error("Freesound search failed:", response.status, (await response.text()).slice(0, 300));
        return res.status(502).json({ error: "Search failed" });
      }
      const data = await response.json();
      res.json({
        query,
        results: (data.results ?? []).map((s: any) => ({ id: s.id, name: String(s.name ?? ""), duration: Number(s.duration) || 0, user: String(s.username ?? "") })),
      });
    } catch (error) {
      console.error("Freesound search failed:", error);
      res.status(502).json({ error: "Search failed" });
    }
  });

  app.get("/api/sfx/file/:id", async (req, res) => {
    const key = process.env.FREESOUND_API_KEY;
    if (!key) return res.status(503).json({ error: "FREESOUND_API_KEY is not set" });
    if (!/^\d{1,10}$/.test(req.params.id)) return res.status(400).json({ error: "Bad id" });
    if (sfxLimited(req, 60)) return res.status(429).json({ error: "Too many requests" });
    try {
      // Look the sound up again so only CC0 sounds are ever served.
      const info = await fetch(`https://freesound.org/apiv2/sounds/${req.params.id}/?fields=license,previews&token=${encodeURIComponent(key)}`);
      if (!info.ok) return res.status(502).json({ error: "Lookup failed" });
      const sound = await info.json();
      if (!/publicdomain\/zero|Creative Commons 0/i.test(String(sound.license ?? ""))) return res.status(403).json({ error: "Not CC0" });
      const preview = sound.previews?.["preview-hq-mp3"];
      if (typeof preview !== "string" || !preview.startsWith("https://")) return res.status(502).json({ error: "No preview" });
      const audio = await fetch(preview);
      if (!audio.ok) return res.status(502).json({ error: "Download failed" });
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(Buffer.from(await audio.arrayBuffer()));
    } catch (error) {
      console.error("Freesound download failed:", error);
      res.status(502).json({ error: "Download failed" });
    }
  });

  // Video understanding: the browser uploads a small proxy (about 360p, 2 fps, mono audio) and the
  // vision model returns scenes, events, the main subject's position, highlights and post text.
  // Times come back to the second; the browser refines them to the frame.
  const visionHits = new Map<string, number[]>();
  const visionLimited = (req: express.Request, limit: number) => {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const hits = (visionHits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
    if (hits.length >= limit) return true;
    hits.push(now);
    visionHits.set(ip, hits);
    return false;
  };
  // The browser sends a small copy (a few MB). The whole file is read and base64-encoded for the
  // model, several copies in memory at once, so a large upload could exhaust a small instance.
  const visionUpload = multer({ dest: path.join(os.tmpdir(), "uploads"), limits: { fileSize: 25 * 1024 * 1024 } });
  const parseJsonReply = (raw: string) => JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));

  app.post("/api/analyze", visionUpload.single("video"), async (req, res) => {
    req.setTimeout(600000);
    res.setTimeout(600000);
    const file = req.file;
    const cleanup = () => file && fs.promises.unlink(file.path).catch(() => {});
    const client = getOpenRouterClient();
    if (!client) {
      cleanup();
      return res.status(503).json({ error: "OPENROUTER_API_KEY is not set" });
    }
    if (!file) return res.status(400).json({ error: "Missing video" });
    if (visionLimited(req, 10)) {
      cleanup();
      return res.status(429).json({ error: "Too many requests" });
    }
    const duration = Number(req.body?.duration) || 0;
    const job = startJob(async () => {
      try {
        const data = (await fs.promises.readFile(file.path)).toString("base64");
        const mime = file.mimetype && file.mimetype.startsWith("video/") ? file.mimetype : "video/mp4";
        const prompt = [
          "Watch and listen to this video carefully. Return ONLY a JSON object with this shape:",
          "{",
          '  "summary": "2-3 sentences about the video",',
          '  "language": "main spoken language code or none",',
          '  "scenes": [{"start": s, "end": s, "description": "what is visible and happening", "quality": "good|blurry|dark|shaky|boring", "interest": 0-10}],',
          '  "events": [{"time": s, "label": "short description", "kind": "cut|action|impact|expression|appear|text|gesture|speech"}],',
          '  "subject": [{"time": s, "x": 0-1, "y": 0-1}],',
          '  "highlights": [{"start": s, "end": s, "title": "catchy short title", "reason": "why it works", "score": 0-10}],',
          '  "title": "video title", "description": "post description", "hashtags": ["#tag"], "thumbnail_time": s',
          "}",
          "Rules:",
          "- Times are seconds from the start of THIS file, with decimals, as precise as you can.",
          `- The video is ${duration ? duration.toFixed(2) : "unknown"} seconds long; never return times past the end.`,
          "- scenes cover the whole video back to back; start a new scene at every camera cut or clear change of shot.",
          "- events: 10-60 notable moments: actions (jump, throw, fall), impacts/sudden sounds, facial expressions (smile, laugh, surprise), objects or people appearing, on-screen text, gestures, and key spoken lines.",
          "- subject: where the main subject (usually a person's face) is in the frame, once per second, x/y as fractions of width/height.",
          "- highlights: 1-5 self-contained moments of 15-60 s that would work as TikTok/Reels shorts, best first. Start and end at sentence boundaries.",
          "- Write summary, descriptions, labels, titles, description and reasons in the video's spoken language (Arabic if it is Arabic or there is no speech).",
        ].join("\n");
        const response = await client.chat.completions.create({
          model: process.env.VISION_MODEL || "google/gemini-3.8-flash",
          temperature: 0.2,
          max_tokens: 12000,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "video_url", video_url: { url: `data:${mime};base64,${data}` } },
              ] as any,
            },
          ],
        });
        return parseJsonReply(response.choices[0]?.message?.content ?? "");
      } finally {
        cleanup();
      }
    });
    res.status(202).json({ job });
  });

  // Auto edit review: the AI watches a light render of the finished edit and returns fixes as editing actions.
  app.post("/api/auto-edit/review", visionUpload.single("video"), async (req, res) => {
    const file = req.file;
    const cleanup = () => file && fs.promises.unlink(file.path).catch(() => {});
    const client = getOpenRouterClient();
    if (!client) {
      cleanup();
      return res.status(503).json({ error: "OPENROUTER_API_KEY is not set" });
    }
    if (!file) return res.status(400).json({ error: "Missing video" });
    const context = typeof req.body?.context === "string" ? req.body.context : "";
    if (!context || context.length > 150_000 || visionLimited(req, 10)) {
      cleanup();
      return res.status(context ? 429 : 400).json({ error: context ? "Too many requests" : "Missing context" });
    }
    const job = startJob(async () => {
      try {
        const data = (await fs.promises.readFile(file.path)).toString("base64");
        const mime = file.mimetype && file.mimetype.startsWith("video/") ? file.mimetype : "video/mp4";
        const response = await client.chat.completions.create({
          model: process.env.VISION_MODEL || "google/gemini-3.8-flash",
          temperature: 0.2,
          max_tokens: 6000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: reviewSystemPrompt() },
            {
              role: "user",
              content: [
                { type: "text", text: context },
                { type: "video_url", video_url: { url: `data:${mime};base64,${data}` } },
              ] as any,
            },
          ],
        });
        return parseJsonReply(response.choices[0]?.message?.content ?? "");
      } finally {
        cleanup();
      }
    });
    res.status(202).json({ job });
  });

  // Frame-level pick: for each question, numbered stills around a moment; the model names the frame.
  app.post("/api/refine-frames", async (req, res) => {
    const client = getOpenRouterClient();
    if (!client) return res.status(503).json({ error: "OPENROUTER_API_KEY is not set" });
    const groups = Array.isArray(req.body?.groups) ? req.body.groups.slice(0, 12) : [];
    if (!groups.length) return res.status(400).json({ error: "Missing frames" });
    if (visionLimited(req, 30)) return res.status(429).json({ error: "Too many requests" });
    try {
      const content: any[] = [
        {
          type: "text",
          text: 'Each group below is a run of consecutive video frames, numbered from 0. For every group, pick the first frame where the described moment happens. Reply ONLY with JSON: {"picks": [frame number per group, in order]}.',
        },
      ];
      groups.forEach((g: any, i: number) => {
        const frames = Array.isArray(g?.frames) ? g.frames.slice(0, 16) : [];
        content.push({ type: "text", text: `Group ${i + 1}: "${String(g?.label ?? "").slice(0, 120)}" (${frames.length} frames)` });
        frames.forEach((f: unknown, j: number) => {
          if (typeof f === "string" && f.startsWith("data:image/jpeg;base64,") && f.length < 200_000) {
            content.push({ type: "text", text: `frame ${j}` }, { type: "image_url", image_url: { url: f } });
          }
        });
      });
      const response = await client.chat.completions.create({
        model: process.env.VISION_MODEL || "google/gemini-3.8-flash",
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content }],
      });
      const parsed = parseJsonReply(response.choices[0]?.message?.content ?? "");
      res.json({ picks: Array.isArray(parsed.picks) ? parsed.picks.map((n: unknown) => Number(n)) : [] });
    } catch (error) {
      console.error("Frame refine failed:", error);
      res.status(502).json({ error: "Refine failed" });
    }
  });

  // SEO: robots.txt for search engines
  app.get("/robots.txt", (req, res) => {
    res.type("text/plain");
    res.send(`User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${req.protocol}://${req.get('host')}/sitemap.xml
`);
  });

  // SEO: sitemap.xml for Google indexing
  app.get("/sitemap.xml", (req, res) => {
    res.type("application/xml");
    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${host}`;
    const today = new Date().toISOString().split('T')[0];

    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`);
  });

  const upload = multer({
    dest: path.join(os.tmpdir(), "uploads"),
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB
  });

  // Serve source videos to Remotion's local Chromium renderer.
  app.get("/api/video/:videoId", (req, res) => {
    const session = videoSessions.get(req.params.videoId);
    if (!session || !fs.existsSync(session.filePath)) {
      return res.status(404).json({ error: "الفيديو غير موجود أو انتهت جلسة المعالجة." });
    }
    res.sendFile(session.filePath);
  });

  // Deterministic React/Remotion export. The rendered composition includes the
  // original video/audio, while the caption canvas uses the shared renderer.
  app.post("/api/remotion-export", upload.single("video"), async (req, res) => {
    req.setTimeout(900000);
    res.setTimeout(900000);

    let temporarySourceId: string | null = null;
    let outputPath: string | null = null;
    const uploadedVideo = req.file;

    const cleanup = () => {
      if (outputPath && fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch (e) {}
      }
      if (temporarySourceId) {
        const sourceSession = videoSessions.get(temporarySourceId);
        if (sourceSession?.filePath && fs.existsSync(sourceSession.filePath)) {
          try { fs.unlinkSync(sourceSession.filePath); } catch (e) {}
        }
        videoSessions.delete(temporarySourceId);
      }
      if (uploadedVideo && fs.existsSync(uploadedVideo.path)) {
        try { fs.unlinkSync(uploadedVideo.path); } catch (e) {}
      }
    };

    try {
      const existingVideoId = req.body.videoId;
      let sourceSession = existingVideoId ? videoSessions.get(existingVideoId) : null;

      if (uploadedVideo) {
        const ext = path.extname(uploadedVideo.originalname || ".mp4") || ".mp4";
        temporarySourceId = `render_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const sourcePath = path.join(STORAGE_DIR, `${temporarySourceId}${ext}`);
        fs.renameSync(uploadedVideo.path, sourcePath);
        sourceSession = {
          filePath: sourcePath,
          originalName: uploadedVideo.originalname || "source.mp4",
          timestamp: Date.now(),
        };
        videoSessions.set(temporarySourceId, sourceSession);
      }

      if (!sourceSession || !fs.existsSync(sourceSession.filePath)) {
        return res.status(400).json({ error: "لم يتم العثور على الفيديو الأصلي للتصدير." });
      }

      const segments = JSON.parse(req.body.segments || "[]");
      const settings = JSON.parse(req.body.settings || "{}");
      const durationInSeconds = Math.max(0.1, Number(req.body.durationInSeconds) || 10);
      const fps = Math.min(60, Math.max(24, Math.round(Number(req.body.fps) || 30)));
      const width = Math.max(2, Math.round(Number(req.body.width) || 1080));
      const height = Math.max(2, Math.round(Number(req.body.height) || 1920));
      const sourceUrl = `http://127.0.0.1:${PORT}/api/video/${temporarySourceId || existingVideoId}`;
      const inputProps = {
        videoUrl: sourceUrl,
        segments,
        settings,
        durationInSeconds,
        fps,
        width,
        height,
      };

      const serveUrl = await getRemotionBundle();
      const composition = await selectComposition({
        serveUrl,
        id: "CaptionVideo",
        inputProps,
      });

      outputPath = path.join(os.tmpdir(), `remotion_export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`);
      const quality = req.body.quality || "ultra";
      const videoBitrate = quality === "balanced" ? "12M" : quality === "high" ? "22M" : "35M";

      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        audioCodec: "aac",
        outputLocation: outputPath,
        inputProps,
        videoBitrate,
        onProgress: ({ progress }) => {
          if (Math.round(progress * 100) % 10 === 0) {
            console.log(`Remotion export progress: ${Math.round(progress * 100)}%`);
          }
        },
      });

      if (!outputPath || !fs.existsSync(outputPath)) {
        throw new Error("لم يتم إنشاء ملف التصدير بواسطة Remotion.");
      }

      const originalName = req.body.filename || sourceSession.originalName || "captioned_video.mp4";
      const outName = `captioned_${originalName.replace(/\.[^/.]+$/, "")}.mp4`;
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(outName)}"`);
      const fileStream = fs.createReadStream(outputPath);
      fileStream.pipe(res);
      fileStream.on("end", cleanup);
      fileStream.on("error", (err) => {
        console.error("Remotion output stream error:", err);
        cleanup();
      });
    } catch (err: any) {
      console.error("Remotion export failed, client fallback may be used:", err?.message || err);
      cleanup();
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || "فشل تصدير Remotion." });
      }
    }
  });

  app.post("/api/transcribe", upload.single("video"), async (req, res) => {
    let storedVideoPath: string | null = null;
    let audioTempPath: string | null = null;

    try {
      req.setTimeout(300000);

      if (!req.file) {
        return res.status(400).json({ error: "لم يتم تقديم ملف فيديو." });
      }

      const openRouterClient = getOpenRouterClient();

      console.log("Transcribing video:", req.file.path);

      // Generate a persistent session videoId
      const videoId = "vid_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
      const ext = path.extname(req.file.originalname) || ".mp4";
      storedVideoPath = path.join(STORAGE_DIR, `${videoId}${ext}`);

      // Move uploaded file to persistent session storage
      fs.renameSync(req.file.path, storedVideoPath);
      videoSessions.set(videoId, {
        filePath: storedVideoPath,
        originalName: req.file.originalname,
        timestamp: Date.now()
      });

      // Extract uncompressed PCM audio for accurate word-level timestamps.
      // MP3 encoder padding and lossy frames can make an LLM's word boundaries
      // drift even when the final video/audio streams are perfectly aligned.
      audioTempPath = path.join(STORAGE_DIR, `${videoId}_extracted.wav`);
      console.log("Extracting uncompressed WAV audio for accurate word timing...");
      try {
        await new Promise<void>((resolve) => {
          ffmpeg(storedVideoPath!)
            .noVideo()
            .audioCodec('pcm_s16le')
            .audioChannels(1)
            .audioFrequency(16000)
            .format('wav')
            .save(audioTempPath!)
            .on('end', () => resolve())
            .on('error', (err) => {
              console.warn("FFmpeg audio extraction error, fallback to source video:", err.message);
              resolve();
            });
        });
      } catch (err) {
        console.warn("Audio extraction skipped:", err);
      }

      if (!audioTempPath || !fs.existsSync(audioTempPath) || fs.statSync(audioTempPath).size <= 1000) {
        throw new Error("تعذر استخراج مسار صوت WAV صالح لتحليل توقيت الكلمات.");
      }

      const fileToTranscribe = audioTempPath;
      const probedDuration = await new Promise<number>((resolve) => {
        ffmpeg.ffprobe(fileToTranscribe, (probeError, metadata) => {
          const duration = Number(metadata?.format?.duration);
          resolve(!probeError && Number.isFinite(duration) ? duration : 0);
        });
      });
      // ffprobe isn't installed on every host; a 16 kHz mono 16-bit WAV is 32000 bytes a second.
      const audioDuration = probedDuration || Math.max(0, (fs.statSync(fileToTranscribe).size - 44) / 32000);

      let extractedWords: Array<{ word: string; start: number; end: number }> = [];
      let transcriptionFailure: string | null = null;
      const runFasterWhisper = async () => {
        try {
          console.log(`Transcribing with faster-whisper (${process.env.FASTER_WHISPER_MODEL || "small"})...`);
          extractedWords = await transcribeWithFasterWhisper(fileToTranscribe);
          console.log(`faster-whisper transcription completed with ${extractedWords.length} words.`);
        } catch (fasterWhisperErr: any) {
          // As a fallback, keep the preferred engine's error: it is the one worth reporting.
          transcriptionFailure ??= fasterWhisperErr?.message || String(fasterWhisperErr);
          console.warn("faster-whisper transcription failed:", fasterWhisperErr?.message || fasterWhisperErr);
        }
      };
      // With an OpenRouter key, use it first: small hosts (e.g. Render's free plan) can't run
      // the local Whisper model. TRANSCRIBE_ENGINE=whisper keeps the local model first.
      const preferOpenRouter = !!openRouterClient && process.env.TRANSCRIBE_ENGINE !== "whisper";
      if (!preferOpenRouter) await runFasterWhisper();

      if (extractedWords.length === 0 && openRouterClient && process.env.TRANSCRIBE_ENGINE !== "gemini") {
        try {
          console.log("Transcribing with OpenRouter Whisper (acoustic word timestamps)...");
          extractedWords = await transcribeWithOpenRouterWhisper(fileToTranscribe);
          console.log(`OpenRouter Whisper completed with ${extractedWords.length} words.`);
        } catch (whisperErr: any) {
          console.warn("OpenRouter Whisper failed, falling back to the chat model:", whisperErr?.message || whisperErr);
        }
      }

      if (extractedWords.length === 0 && openRouterClient) {
        try {
        const modelName = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
        const audioBuffer = fs.readFileSync(fileToTranscribe);
        const base64Audio = audioBuffer.toString("base64");
        const audioFormat: "wav" = "wav";
        console.log(`Transcribing with OpenRouter model ${modelName}...`);

        const response = await openRouterClient.chat.completions.create({
          model: modelName,
          messages: [{
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Transcribe every spoken word in this audio and return only valid JSON in this exact shape:",
                  "{\"words\":[{\"word\":\"...\",\"start\":0.2,\"end\":0.6}]}",
                  `The audio duration is ${audioDuration > 0 ? audioDuration.toFixed(3) : "unknown"} seconds.`,
                  "Use the actual acoustic position of every word in the audio.",
                  "Set start to the instant the word begins being spoken and end to the instant it finishes.",
                  "Do not distribute words evenly, do not shift timestamps earlier or later, do not smooth pauses, and do not reuse a segment timestamp for multiple words.",
                  "Keep genuine pauses between words. Include accurate word-level timestamps in seconds.",
                  "If the audio is Arabic, keep the transcription in Arabic without translating.",
                  "Do not include markdown or explanations.",
                ].join(" "),
              },
              {
                type: "input_audio",
                input_audio: {
                  data: base64Audio,
                  format: audioFormat,
                },
              },
            ],
          }],
          response_format: { type: "json_object" },
        });

        const responseContent = response.choices[0]?.message?.content;
        const responseText = typeof responseContent === "string" ? responseContent : "";
        const jsonText = responseText.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
        const parsed = JSON.parse(jsonText);
        if (Array.isArray(parsed.words)) {
          extractedWords = parsed.words
            .filter((word: any) => word && typeof word.word === "string" && Number.isFinite(Number(word.start)) && Number.isFinite(Number(word.end)))
            .map((word: any) => ({
              word: word.word,
              start: Number(word.start),
              end: Number(word.end),
            }));
        }

        if (extractedWords.length > 1 && audioDuration > 0) {
          const speechBounds = await detectSpeechBounds(fileToTranscribe, audioDuration);
          extractedWords = calibrateWordTimeline(extractedWords, speechBounds, audioDuration);
          // Chat-model times are estimates: pin them to the real pauses so they can't drift.
          extractedWords = alignToSpeech(extractedWords, await detectSpeechSegments(fileToTranscribe, audioDuration), audioDuration);
        }

        console.log(`OpenRouter transcription completed with ${extractedWords.length} words.`);
        } catch (openRouterErr: any) {
          transcriptionFailure = openRouterErr?.message || String(openRouterErr);
          console.error("OpenRouter transcription error:", openRouterErr?.message || openRouterErr);
        }
      }

      if (extractedWords.length === 0 && preferOpenRouter) await runFasterWhisper();

      if (extractedWords.length === 0) {
        if (transcriptionFailure) {
          return res.status(500).json({
            error: `تعذر تشغيل محرك التفريغ: ${transcriptionFailure}`,
            videoId,
          });
        }
        return res.status(200).json({
          noSpeechFound: true,
          warning: "لم يتم العثور على أي كلام أو نصوص منطوقة في الفيديو. يمكنك إضافة كابشن تجريبي أو إدخال النصوص يدوياً واستيراد SRT.",
          videoId,
          segments: []
        });
      }

      // Group words into natural caption chunks (3-5 words)
      const segments: any[] = [];
      let currentWords: any[] = [];
      let segmentStart = 0;

      for (const word of extractedWords) {
        if (currentWords.length === 0) {
          segmentStart = word.start;
        }

        currentWords.push({
          id: Math.random().toString(36).substring(7),
          text: word.word,
          start: word.start,
          end: word.end
        });

        if (currentWords.length >= 4) {
          segments.push({
            id: Math.random().toString(36).substring(7),
            start: segmentStart,
            end: word.end,
            words: currentWords
          });
          currentWords = [];
        }
      }

      if (currentWords.length > 0) {
        segments.push({
          id: Math.random().toString(36).substring(7),
          start: segmentStart,
          end: currentWords[currentWords.length - 1].end,
          words: currentWords
        });
      }

      console.log("Transcription successful for session videoId:", videoId, `Total segments: ${segments.length}`);
      res.json({ segments, videoId });

    } catch (error: any) {
      console.error("Transcription error:", error);
      res.status(500).json({ error: error.message || String(error) });
    } finally {
      if (audioTempPath && fs.existsSync(audioTempPath)) {
        try { fs.unlinkSync(audioTempPath); } catch (e) {}
      }
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) {}
      }
    }
  });

  // Convert/Transcode video to standard web-compatible H.264 MP4 for preview
  const handleTranscodeRequest = async (req: express.Request, res: express.Response) => {
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000);

    if (!req.file) {
      return res.status(400).json({ error: "No video file provided" });
    }

    const ext = path.extname(req.file.originalname) || ".mp4";
    const tempInput = req.file.path + ext;
    const tempOutput = req.file.path + "_compatible.mp4";

    const cleanup = () => {
      try {
        if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
        if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
      } catch (e) {
        console.error("Cleanup error in transcode:", e);
      }
    };

    try {
      fs.renameSync(req.file.path, tempInput);
      console.log("Transcoding video for web compatibility:", tempInput);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(tempInput)
          .outputOptions([
            '-c:v libx264',
            '-preset ultrafast',
            '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2',
            '-crf 26',
            '-pix_fmt yuv420p',
            '-c:a aac',
            '-b:a 128k',
            '-movflags +faststart'
          ])
          .save(tempOutput)
          .on('end', () => resolve())
          .on('error', (err) => reject(err));
      });

      if (!fs.existsSync(tempOutput)) {
        cleanup();
        return res.status(500).json({ error: "Transcoded output file was not created" });
      }

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', 'inline; filename="preview.mp4"');

      const filestream = fs.createReadStream(tempOutput);
      filestream.pipe(res);

      filestream.on('end', () => {
        cleanup();
      });
      filestream.on('error', (err) => {
        console.error("Transcode stream error:", err);
        cleanup();
      });
    } catch (err: any) {
      console.error("Transcode failed:", err);
      cleanup();
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to transcode: " + err.message });
      }
    }
  };

  app.post("/api/transcode", upload.single("video"), handleTranscodeRequest);
  app.post("/api/convert", upload.single("video"), handleTranscodeRequest);

  // Remux client-rendered canvas video with original pristine audio to output standard H.264 MP4
  app.post("/api/remux", upload.fields([{ name: "video", maxCount: 1 }, { name: "originalVideo", maxCount: 1 }]), async (req, res) => {
    req.setTimeout(300000); // 5 mins
    res.setTimeout(300000);

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const videoFile = files?.['video']?.[0];
    const originalVideoFile = files?.['originalVideo']?.[0];

    if (!videoFile) {
      return res.status(400).json({ error: "لم يتم تقديم ملف الفيديو المسجل" });
    }

    const videoId = req.body.videoId;
    const session = videoId ? videoSessions.get(videoId) : null;
    const inputExtension = path.extname(videoFile.originalname || "").toLowerCase() === ".mp4"
      ? ".mp4"
      : ".webm";
    const tempCanvasVideo = videoFile.path + `_canvas${inputExtension}`;
    const tempOutput = videoFile.path + "_remuxed.mp4";
    let tempOriginalAudio: string | null = null;

    const cleanup = () => {
      try {
        if (fs.existsSync(tempCanvasVideo)) fs.unlinkSync(tempCanvasVideo);
        if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
        if (fs.existsSync(videoFile.path)) fs.unlinkSync(videoFile.path);
        if (originalVideoFile && fs.existsSync(originalVideoFile.path)) fs.unlinkSync(originalVideoFile.path);
        if (tempOriginalAudio && fs.existsSync(tempOriginalAudio)) fs.unlinkSync(tempOriginalAudio);
      } catch (e) {}
    };

    try {
      fs.renameSync(videoFile.path, tempCanvasVideo);

      // Determine audio source (either from freshly uploaded original video or cached session)
      let audioSourcePath: string | null = null;
      if (originalVideoFile && fs.existsSync(originalVideoFile.path)) {
        const origExt = path.extname(originalVideoFile.originalname || ".mp4") || ".mp4";
        tempOriginalAudio = originalVideoFile.path + origExt;
        fs.renameSync(originalVideoFile.path, tempOriginalAudio);
        audioSourcePath = tempOriginalAudio;
      } else if (session && fs.existsSync(session.filePath)) {
        audioSourcePath = session.filePath;
      }

      const quality = req.body.quality || 'ultra';
      const requestedFps = Number(req.body.fps);
      const fps = Number.isFinite(requestedFps) && requestedFps >= 24 && requestedFps <= 60
        ? Math.round(requestedFps)
        : 30;
      let x264Preset = 'fast';
      let crf = '16';
      let audioBitrate = '320k';

      if (quality === 'ultra') {
        x264Preset = 'fast';
        crf = '15'; // Visually lossless crystal clear quality
        audioBitrate = '320k';
      } else if (quality === 'high') {
        x264Preset = 'veryfast';
        crf = '18';
        audioBitrate = '256k';
      } else if (quality === 'balanced') {
        x264Preset = 'veryfast';
        crf = '21';
        audioBitrate = '192k';
      }

      console.log(`Remuxing WYSIWYG video for session: ${videoId} at ${fps}fps with quality: ${quality} (CRF ${crf}, preset ${x264Preset}, audio ${audioBitrate})`);

      // 1. Probe exact duration of original video/audio so we never cut off any seconds
      let exactDuration = 0;
      if (req.body.duration && !isNaN(Number(req.body.duration))) {
        exactDuration = Number(req.body.duration);
      }

      if (audioSourcePath && fs.existsSync(audioSourcePath)) {
        try {
          const probedDuration = await new Promise<number>((resolve) => {
            ffmpeg.ffprobe(audioSourcePath!, (err, metadata) => {
              if (err || !metadata?.format?.duration) {
                resolve(0);
              } else {
                resolve(Number(metadata.format.duration));
              }
            });
          });
          if (probedDuration > 0) {
            exactDuration = probedDuration;
          }
        } catch (probeErr) {
          console.warn("Could not probe original video duration:", probeErr);
        }
      }

      console.log(`Target exact duration for export: ${exactDuration}s`);

      const command = ffmpeg(tempCanvasVideo);
      let videoSyncFilter: string | null = null;

      if (audioSourcePath && fs.existsSync(audioSourcePath)) {
        try {
          const streamStarts = await new Promise<{ video: number; audio: number }>((resolve) => {
            ffmpeg.ffprobe(tempCanvasVideo, (videoErr, videoMetadata) => {
              ffmpeg.ffprobe(audioSourcePath!, (audioErr, audioMetadata) => {
                const videoStream = videoMetadata?.streams?.find((stream) => stream.codec_type === 'video');
                const audioStream = audioMetadata?.streams?.find((stream) => stream.codec_type === 'audio');
                resolve({
                  video: !videoErr && videoStream?.start_time != null ? Number(videoStream.start_time) : 0,
                  audio: !audioErr && audioStream?.start_time != null ? Number(audioStream.start_time) : 0,
                });
              });
            });
          });

          const startDelta = streamStarts.video - streamStarts.audio;
          // MediaRecorder can add a small video timestamp offset. Move only the
          // rendered video when it starts later so the original audio stays pristine.
          if (startDelta > 0.005) {
            videoSyncFilter = `setpts=PTS-${startDelta.toFixed(6)}/TB`;
            console.log(`Aligning rendered video ${Math.round(startDelta * 1000)}ms earlier to match original audio.`);
          } else if (Math.abs(startDelta) > 0.005) {
            console.log(`Audio/video start delta is ${Math.round(startDelta * 1000)}ms; preserving original audio timing.`);
          }
        } catch (syncProbeErr) {
          console.warn("Could not measure audio/video start delta:", syncProbeErr);
        }
      }

      if (audioSourcePath && fs.existsSync(audioSourcePath)) {
        // Mux video from client canvas (0:v) + original pristine audio (1:a)
        const outputOpts = [
          '-map 0:v:0',
          '-map 1:a:0?',
          '-fflags +genpts',
          '-vsync cfr',
          `-r ${fps}`,
          ...(videoSyncFilter ? ['-vf', videoSyncFilter] : []),
          '-c:v libx264',
          `-preset ${x264Preset}`,
          `-crf ${crf}`,
          '-pix_fmt yuv420p',
          '-c:a aac',
          `-b:a ${audioBitrate}`,
          '-af aresample=async=1:first_pts=0',
          ...(exactDuration > 0 ? ['-t', String(exactDuration)] : []),
          '-shortest',
          '-avoid_negative_ts make_zero',
          '-movflags +faststart'
        ];

        command
          .input(audioSourcePath)
          .outputOptions(outputOpts);
      } else {
        // Direct conversion of client video/audio to standard universal H.264 MP4
        const outputOpts = [
          '-map 0:v:0',
          '-map 0:a:0?',
          '-fflags +genpts',
          '-vsync cfr',
          `-r ${fps}`,
          '-c:v libx264',
          `-preset ${x264Preset}`,
          `-crf ${crf}`,
          '-pix_fmt yuv420p',
          '-c:a aac',
          `-b:a ${audioBitrate}`,
          '-af aresample=async=1:first_pts=0',
          '-movflags +faststart'
        ];

        command.outputOptions(outputOpts);
      }

      await new Promise<void>((resolve, reject) => {
        command
          .save(tempOutput)
          .on('end', () => resolve())
          .on('error', (err) => reject(err));
      });

      if (!fs.existsSync(tempOutput)) {
        cleanup();
        return res.status(500).json({ error: "فشل إنشاء الفيديو النهائي." });
      }

      const originalName = req.body.filename || session?.originalName || originalVideoFile?.originalname || "captioned_video.mp4";
      const outName = 'captioned_' + originalName.replace(/\.[^/.]+$/, "") + ".mp4";

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(outName)}"`);

      const filestream = fs.createReadStream(tempOutput);
      filestream.pipe(res);

      filestream.on('end', () => {
        cleanup();
      });
      filestream.on('error', (err) => {
        console.error("Remux stream error:", err);
        cleanup();
      });

    } catch (err: any) {
      console.error("Remux failed:", err);
      cleanup();
      if (!res.headersSent) {
        res.status(500).json({ error: "فشل دمج الفيديو والصوت: " + err.message });
      }
    }
  });

  // Export video with burned ASS subtitles
  // Supports both lightweight session videoId (Captions.ai style) and direct file upload fallback
  app.post("/api/export", upload.single("video"), async (req, res) => {
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000);

    let inputFilePath: string | null = null;
    let assFilePath: string | null = null;
    let outputFilePath: string | null = null;
    let isTempInput = false;

    const cleanupFiles = () => {
      try {
        if (isTempInput && inputFilePath && fs.existsSync(inputFilePath)) fs.unlinkSync(inputFilePath);
        if (assFilePath && fs.existsSync(assFilePath)) fs.unlinkSync(assFilePath);
        if (outputFilePath && fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath);
      } catch (e) {
        console.error("Cleanup error:", e);
      }
    };

    try {
      const assContent = req.body.ass;
      if (!assContent) {
        return res.status(400).json({ error: "لم يتم تقديم نص الترجمة المصاحبة" });
      }

      const videoId = req.body.videoId;
      const session = videoId ? videoSessions.get(videoId) : null;

      if (session && fs.existsSync(session.filePath)) {
        // Fast Cloud Session path: Video is already on server!
        inputFilePath = session.filePath;
        isTempInput = false;
        console.log(`Exporting from cached session videoId: ${videoId}`);
      } else if (req.file) {
        // Fallback: file was uploaded in request
        const ext = path.extname(req.body.filename || req.file.originalname) || ".mp4";
        inputFilePath = req.file.path + ext;
        fs.renameSync(req.file.path, inputFilePath);
        isTempInput = true;
      } else {
        return res.status(400).json({ error: "لم يتم العثور على ملف الفيديو أو انتهت صلاحية الجلسة." });
      }

      const tempBase = path.join(STORAGE_DIR, "export_" + Math.random().toString(36).substring(7));
      assFilePath = tempBase + ".ass";
      fs.writeFileSync(assFilePath, assContent, "utf8");

      outputFilePath = tempBase + "_output.mp4";

      console.log("Exporting video with burned subtitles via FFmpeg...");
      const fontsDirPath = path.join(process.cwd(), "fonts").replace(/\\/g, "/").replace(/:/g, "\\:");
      const escapedAssPath = assFilePath.replace(/\\/g, "/").replace(/:/g, "\\:");
      const quality = req.body.quality || '1080p';

      const filters: string[] = [
        `ass='${escapedAssPath}':fontsdir='${fontsDirPath}'`
      ];

      if (quality === '720p') {
        filters.push('scale=-2:720');
      }

      const crfValue = quality === '720p' ? '24' : '19'; // Ultra-crisp visual quality

      ffmpeg(inputFilePath)
        .videoFilters(filters)
        .outputOptions([
          '-c:v libx264',
          '-preset faster',
          `-crf ${crfValue}`,
          '-pix_fmt yuv420p',
          '-map 0:v:0',
          '-map 0:a:0?', // Preserve full pristine audio track if exists
          '-c:a aac',    // Universal high quality AAC audio compatible with all devices
          '-b:a 192k',
          '-movflags +faststart'
        ])
        .save(outputFilePath)
        .on('start', (commandLine) => {
          console.log('FFmpeg spawn command:', commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`Encoding: ${Math.round(progress.percent)}% done`);
          }
        })
        .on('end', () => {
          console.log("Video export completed successfully:", outputFilePath);
          if (!fs.existsSync(outputFilePath!)) {
            cleanupFiles();
            return res.status(500).json({ error: "ملف الإخراج لم يتم إنشاؤه." });
          }

          const originalName = req.body.filename || session?.originalName || "captioned_video.mp4";
          const outName = 'captioned_' + originalName.replace(/\.[^/.]+$/, "") + ".mp4";

          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(outName)}"`);

          const filestream = fs.createReadStream(outputFilePath!);
          filestream.pipe(res);

          filestream.on('end', () => {
            cleanupFiles();
          });
          filestream.on('error', (err) => {
            console.error("Output stream error:", err);
            cleanupFiles();
          });
        })
        .on('error', (err, stdout, stderr) => {
          console.error("FFmpeg error:", err.message);
          console.error("FFmpeg stderr:", stderr);
          cleanupFiles();
          if (!res.headersSent) {
            res.status(500).json({ error: "فشل ترميز الفيديو: " + err.message });
          }
        });

    } catch (err: any) {
      console.error("Export endpoint error:", err);
      cleanupFiles();
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || "حدث خطأ غير متوقع أثناء التصدير" });
      }
    }
  });

  // Catch unmatched API routes to never return HTML for /api/*
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.path}` });
  });

  // Global error handler for API and multer errors
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Express global error handler:", err);
    if (res.headersSent) {
      return next(err);
    }
    // Upload limits answer with 413 so the browser can say the file is too big.
    res.status(err?.code === "LIMIT_FILE_SIZE" ? 413 : err.status || 500).json({
      error: err.message || "حدث خطأ أثناء معالجة الطلب في الخادم."
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          // Build files carry a content hash, so they never change; the service worker must always be fresh.
          if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
        },
      })
    );
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
