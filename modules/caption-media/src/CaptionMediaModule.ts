import { NativeModule, requireNativeModule } from 'expo';

import type { AudioExtractionResult, MediaInfo } from './CaptionMedia.types';

declare class CaptionMediaModule extends NativeModule<{}> {
  getMediaInfo(inputUri: string): Promise<MediaInfo>;
  extractAudioToWav(
    inputUri: string,
    outputUri: string,
  ): Promise<AudioExtractionResult>;
}

export default requireNativeModule<CaptionMediaModule>('CaptionMedia');
