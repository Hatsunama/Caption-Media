export type MediaInfo = {
  durationMs: number;
  width: number;
  height: number;
  rotation: number;
  hasAudio: boolean;
};

export type AudioExtractionResult = {
  outputUri: string;
  sampleRate: number;
  channelCount: number;
  durationMs: number;
  pcmBytes: number;
};
