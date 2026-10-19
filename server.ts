import express from "express";
import { createServer as createViteServer } from "vite";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import multer from "multer";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import os from "os";
import { execFile, execSync } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { commandSystemPrompt } from "./src/editor/commandSpec";

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
      const audioDuration = await new Promise<number>((resolve) => {
        ffmpeg.ffprobe(fileToTranscribe, (probeError, metadata) => {
          const duration = Number(metadata?.format?.duration);
          resolve(!probeError && Number.isFinite(duration) ? duration : 0);
        });
      });

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
    res.status(err.status || 500).json({
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
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
