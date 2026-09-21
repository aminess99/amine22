import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  delayRender,
  continueRender,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CaptionSegment, EditorSettings } from "../types";
import { CaptionOverlay } from "../components/CaptionOverlay";
import "./captionOverlay.css";

export interface CaptionVideoProps {
  videoUrl: string;
  segments: CaptionSegment[];
  settings: EditorSettings;
  durationInSeconds: number;
  fps: number;
  width: number;
  height: number;
}

export const CaptionVideoComposition: React.FC<CaptionVideoProps> = ({
  videoUrl,
  segments,
  settings,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const [renderHandle] = useState(() => delayRender("Waiting for caption canvas"));

  useEffect(() => {
    let cancelled = false;

    const fontFiles: Record<string, string> = {
      Cairo: "Cairo.ttf",
      Tajawal: "Tajawal.ttf",
      Almarai: "Almarai.ttf",
      Rubik: "Rubik.ttf",
      Anton: "Anton.ttf",
      Montserrat: "Montserrat.ttf",
      "Playfair Display": "PlayfairDisplay.ttf",
      Cinzel: "Cinzel.ttf",
      Inter: "Inter.ttf",
      Roboto: "Roboto.ttf",
      "Space Mono": "Space Mono.ttf",
    };

    const loadSelectedFont = async () => {
      const fontFamily = (settings.fontFamily || "Cairo").trim();
      const fontFile = fontFiles[fontFamily];

      if (fontFile && typeof FontFace !== "undefined") {
        try {
          const existingFont = Array.from(document.fonts).find(
            (font) => font.family === fontFamily,
          );
          if (!existingFont) {
            const font = new FontFace(
              fontFamily,
              `url("/fonts/${encodeURIComponent(fontFile)}")`,
              { weight: "100 900" },
            );
            await font.load();
            document.fonts.add(font);
          }
        } catch (fontError) {
          console.warn(`Could not load Remotion font ${fontFamily}:`, fontError);
        }
      }

      await document.fonts.ready;
      if (!cancelled) {
        continueRender(renderHandle);
      }
    };

    loadSelectedFont().catch(() => {
      if (!cancelled) continueRender(renderHandle);
    });

    return () => {
      cancelled = true;
    };
  }, [renderHandle, settings.fontFamily]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo
        src={videoUrl}
        muted={false}
        volume={1}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "fill",
        }}
      />
      <CaptionOverlay
        segments={segments}
        currentTime={frame / fps}
        settings={settings}
      />
    </AbsoluteFill>
  );
};