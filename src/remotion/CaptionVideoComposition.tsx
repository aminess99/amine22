import React, { useLayoutEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  delayRender,
  continueRender,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CaptionSegment, EditorSettings } from "../types";
import { drawCaptionsOnCanvas } from "../lib/canvasCaptionRenderer";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasReleasedInitialRender = useRef(false);
  const [renderHandle] = useState(() => delayRender("Waiting for caption canvas"));

  useLayoutEffect(() => {
    let cancelled = false;

    const drawFrame = () => {
      if (cancelled || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const context = canvas.getContext("2d", {
        alpha: true,
        desynchronized: false,
      });

      if (!context) {
        if (!hasReleasedInitialRender.current) {
          hasReleasedInitialRender.current = true;
          continueRender(renderHandle);
        }
        return;
      }

      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      drawCaptionsOnCanvas(
        context,
        segments,
        frame / fps,
        settings,
        width,
        height,
      );

      if (!hasReleasedInitialRender.current) {
        hasReleasedInitialRender.current = true;
        continueRender(renderHandle);
      }
    };

    if (document.fonts?.ready) {
      document.fonts.ready.then(drawFrame).catch(drawFrame);
    } else {
      drawFrame();
    }

    return () => {
      cancelled = true;
    };
  }, [frame, fps, height, renderHandle, segments, settings, width]);

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
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};