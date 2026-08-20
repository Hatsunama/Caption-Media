import { NativeModule, requireNativeModule } from 'expo';

import type { AudioExtractionResult, MediaInfo, VideoThumbnailResult } from './CaptionMedia.types';

declare class CaptionMediaModule extends NativeModule<{}> {
  persistReadPermission(inputUri: string): Promise<boolean>;
  sha256(inputUri: string): Promise<string>;
  getMediaInfo(inputUri: string): Promise<MediaInfo>;
  extractAudioToWav(
    inputUri: string,
    outputUri: string,
  ): Promise<AudioExtractionResult>;
  generateVideoThumbnail(
    inputUri: string,
    outputUri: string,
    timeMs: number,
  ): Promise<VideoThumbnailResult>;
}

export default requireNativeModule<CaptionMediaModule>('CaptionMedia');
