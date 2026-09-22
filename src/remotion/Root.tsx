import React from "react";
import { Composition } from "remotion";
import {
  CaptionVideoComposition,
  CaptionVideoProps,
} from "./CaptionVideoComposition";

const defaultProps: CaptionVideoProps = {
  videoUrl: "",
  segments: [],
  settings: {
    template: "classic",
    primaryColor: "#FFDE59",
    outlineColor: "#000000",
    backgroundColor: "transparent",
    fontSize: 48,
    fontFamily: "Cairo",
    yPosition: "bottom",
    aspectRatio: "9:16",
    wordsPerChunk: 3,
    showEmojis: true,
    syncOffset: 0,
  },
  durationInSeconds: 10,
  fps: 30,
  width: 1080,
  height: 1920,
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="CaptionVideo"
    component={CaptionVideoComposition}
    defaultProps={defaultProps}
    width={defaultProps.width}
    height={defaultProps.height}
    fps={defaultProps.fps}
    durationInFrames={defaultProps.fps * defaultProps.durationInSeconds}
    calculateMetadata={({ props }) => {
      const renderProps = props as unknown as CaptionVideoProps;
      return {
        durationInFrames: Math.max(1, Math.ceil(renderProps.durationInSeconds * renderProps.fps)),
        fps: renderProps.fps,
        width: renderProps.width,
        height: renderProps.height,
      };
    }}
  />
);