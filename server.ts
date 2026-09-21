import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import OpenAI from "openai";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import os from "os";
import { execSync } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

dotenv.config();

// Ensure all application custom fonts are registered in the system font cache for libass / FFmpeg
try {
  const fontSrcDir = path.join(process.cwd(), "fonts");
  const fontDestDir = "/usr/local/share/fonts/viral";
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
    execSync("fc-cache -f /usr/local/share/fonts/viral", { stdio: "ignore" });
    console.log("System fonts registered and cached successfully for FFmpeg/libass.");
  }
} catch (fontErr) {
  console.warn("Font registration check completed:", fontErr);
}

// Safe derivation of directory path for both tsx (ESM) and esbuild CJS bundle
const currentDirname = typeof __dirname !== "undefined" ? __dirname : process.cwd();

// Shared Gemini AI Client instance
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
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
  const PORT = Number(process.env.PORT) || 5000;

  app.use(express.json({ limit: "500mb" }));
  app.use(express.urlencoded({ extended: true, limit: "500mb" }));

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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

  app.post("/api/transcribe", upload.single("video"), async (req, res) => {
    let storedVideoPath: string | null = null;
    let audioTempPath: string | null = null;

    try {
      if (!req.file) {
        return res.status(400).json({ error: "لم يتم تقديم ملف فيديو." });
      }

      const geminiClient = getGeminiClient();
      const openAiKey = process.env.OPENAI_API_KEY;
      const hasOpenAi = openAiKey && openAiKey !== "MY_OPENAI_API_KEY";

      if (!geminiClient && !hasOpenAi) {
        return res.status(400).json({
          error: "مفتاح الذكاء الاصطناعي غير متوفر. يرجى التأكد من ضبط GEMINI_API_KEY أو OPENAI_API_KEY في الإعدادات."
        });
      }

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

      // Extract lightweight MP3 for ultra-fast audio transcription
      audioTempPath = path.join(STORAGE_DIR, `${videoId}_extracted.mp3`);
      console.log("Extracting audio from video for fast AI transcription...");
      try {
        await new Promise<void>((resolve) => {
          ffmpeg(storedVideoPath!)
            .noVideo()
            .audioCodec('libmp3lame')
            .audioBitrate('64k')
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

      const fileToTranscribe = (audioTempPath && fs.existsSync(audioTempPath) && fs.statSync(audioTempPath).size > 1000)
        ? audioTempPath
        : storedVideoPath;

      let extractedWords: Array<{ word: string; start: number; end: number }> = [];
      let creditsDepleted = false;

      // 1. Try Gemini Transcription (gemini-3.6-flash and gemini-3.5-flash-lite)
      if (geminiClient) {
        const modelsToTry = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"];
        for (const modelName of modelsToTry) {
          if (extractedWords.length > 0 || creditsDepleted) break;
          try {
            console.log(`Transcribing with ${modelName}...`);
            const audioBuffer = fs.readFileSync(fileToTranscribe);
            const base64Audio = audioBuffer.toString("base64");
            const mime = fileToTranscribe.endsWith(".mp3") ? "audio/mp3" : "video/mp4";

            const response = await geminiClient.models.generateContent({
              model: modelName,
              contents: [
                {
                  inlineData: {
                    mimeType: mime,
                    data: base64Audio,
                  },
                },
                {
                  text: "Transcribe every single spoken word from this audio. Return accurate word-level start and end timestamps in seconds (e.g. start: 0.2, end: 0.6). If the audio is in Arabic, transcribe accurately in Arabic without translating. Capture every word accurately in sequential order.",
                },
              ],
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    words: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          word: { type: Type.STRING },
                          start: { type: Type.NUMBER },
                          end: { type: Type.NUMBER },
                        },
                        required: ["word", "start", "end"],
                      },
                    },
                  },
                  required: ["words"],
                },
              },
            });

            if (response.text) {
              const parsed = JSON.parse(response.text);
              if (Array.isArray(parsed.words) && parsed.words.length > 0) {
                extractedWords = parsed.words;
                console.log(`Gemini (${modelName}) transcription succeeded with ${extractedWords.length} words.`);
                break;
              }
            }
          } catch (geminiErr: any) {
            const errStr = String(geminiErr?.message || geminiErr || '');
            if (errStr.includes("prepayment credits") || errStr.includes("402") || errStr.includes("RESOURCE_EXHAUSTED")) {
              creditsDepleted = true;
              console.log(`[Gemini API Info] Prepayment credits depleted on Google AI Studio project. Stopping model retries.`);
              break;
            } else {
              console.log(`[Gemini API Info] ${modelName} returned: ${errStr.slice(0, 100)}`);
            }
          }
        }
      }

      // 2. Fallback to OpenAI Whisper if Gemini didn't return words and OpenAI key exists
      if (extractedWords.length === 0 && hasOpenAi) {
        try {
          console.log("Transcribing with OpenAI Whisper fallback...");
          const openai = new OpenAI({ apiKey: openAiKey });
          const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(fileToTranscribe),
            model: "whisper-1",
            response_format: "verbose_json",
            timestamp_granularities: ["word"],
          });

          if (transcription.words && transcription.words.length > 0) {
            extractedWords = transcription.words.map(w => ({
              word: w.word,
              start: w.start,
              end: w.end,
            }));
            console.log(`Whisper transcription succeeded with ${extractedWords.length} words.`);
          }
        } catch (openaiErr: any) {
          console.error("OpenAI Whisper error:", openaiErr.message);
        }
      }

      if (extractedWords.length === 0) {
        if (creditsDepleted) {
          return res.status(200).json({
            creditsDepleted: true,
            warning: "رصيد حساب Google AI Studio مستنفد (Prepayment credits depleted). تم تجهيز الفيديو، ويمكنك الآن تجربة كافة القوالب والتصدير بكابشن تجريبي فوري أو استيراد ملف SRT أو كتابة النصوص يدوياً.",
            videoId,
            segments: []
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
    const tempCanvasVideo = videoFile.path + "_canvas.webm";
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

      console.log(`Remuxing client canvas video for session: ${videoId} with quality: ${quality} (CRF ${crf}, preset ${x264Preset}, audio ${audioBitrate})`);

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

      if (audioSourcePath && fs.existsSync(audioSourcePath)) {
        // Mux video from client canvas (0:v) + original pristine audio (1:a)
        const outputOpts = [
          '-map 0:v:0',
          '-map 1:a:0?',
          '-c:v libx264',
          `-preset ${x264Preset}`,
          `-crf ${crf}`,
          '-pix_fmt yuv420p',
          '-c:a aac',
          `-b:a ${audioBitrate}`,
          '-shortest',
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
          '-c:v libx264',
          `-preset ${x264Preset}`,
          `-crf ${crf}`,
          '-pix_fmt yuv420p',
          '-c:a aac',
          `-b:a ${audioBitrate}`,
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
