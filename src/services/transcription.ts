import { Directory, File, Paths } from 'expo-file-system';
import { initWhisper } from 'whisper.rn/index';

import CaptionMedia from '../../modules/caption-media/src/CaptionMediaModule';
import { groupWordsIntoCaptions } from '@/lib/caption-grouping';
import { getModel, type TranscriptionModel } from '@/lib/model-catalog';
import type { CaptionBlock, WordToken } from '@/types/project';

export type TranscriptionStage =
  | 'preparing-audio'
  | 'downloading-model'
  | 'transcribing'
  | 'grouping';

export type TranscriptionProgress = {
  stage: TranscriptionStage;
  progress: number;
  detail: string;
};

export type LocalTranscriptionResult = {
  language: string;
  words: WordToken[];
  captions: CaptionBlock[];
  audioUri: string;
};

export async function ensureModel(
  modelId: TranscriptionModel['id'],
  onProgress?: (progress: TranscriptionProgress) => void,
): Promise<File> {
  const model = getModel(modelId);
  const modelDirectory = new Directory(Paths.document, 'models');
  modelDirectory.create({ idempotent: true, intermediates: true });
  const modelFile = new File(modelDirectory, model.fileName);

  if (modelFile.exists && modelFile.size === model.downloadBytes) {
    return modelFile;
  }

  onProgress?.({
    stage: 'downloading-model',
    progress: 0,
    detail: `Downloading ${model.label} model once for offline use`,
  });

  await File.downloadFileAsync(model.downloadUrl, modelFile, {
    idempotent: true,
    onProgress: ({ bytesWritten, totalBytes }) => {
      const denominator = totalBytes > 0 ? totalBytes : model.downloadBytes;
      onProgress?.({
        stage: 'downloading-model',
        progress: Math.min(1, bytesWritten / denominator),
        detail: `Downloading ${model.label} model`,
      });
    },
  });

  return modelFile;
}

export async function transcribeVideoLocally(options: {
  projectId: string;
  videoUri: string;
  modelId: TranscriptionModel['id'];
  language?: string;
  onProgress?: (progress: TranscriptionProgress) => void;
}): Promise<LocalTranscriptionResult> {
  const { projectId, videoUri, modelId, onProgress } = options;
  const audioDirectory = new Directory(Paths.cache, 'caption-audio');
  audioDirectory.create({ idempotent: true, intermediates: true });
  const audioFile = new File(audioDirectory, `${projectId}.wav`);

  onProgress?.({
    stage: 'preparing-audio',
    progress: 0,
    detail: 'Extracting audio on this phone',
  });
  await CaptionMedia.extractAudioToWav(videoUri, audioFile.uri);
  onProgress?.({
    stage: 'preparing-audio',
    progress: 1,
    detail: 'Audio ready',
  });

  const modelFile = await ensureModel(modelId, onProgress);
  const context = await initWhisper({
    filePath: modelFile.uri,
    useGpu: false,
  });

  try {
    const { promise } = context.transcribe(audioFile.uri, {
      language: options.language ?? 'en',
      maxThreads: 4,
      tokenTimestamps: true,
      maxLen: 1,
      wordThold: 0.01,
      onProgress: (value: number) =>
        onProgress?.({
          stage: 'transcribing',
          progress: value / 100,
          detail: 'Generating word timings locally',
        }),
    });
    const result = await promise;
    if (result.isAborted) throw new Error('Transcription was cancelled');

    const words = normalizeWordSegments(result.segments);
    onProgress?.({
      stage: 'grouping',
      progress: 0.5,
      detail: 'Grouping words into editable subtitles',
    });
    const captions = groupWordsIntoCaptions(words);
    onProgress?.({
      stage: 'grouping',
      progress: 1,
      detail: 'Captions ready',
    });

    return {
      language: result.language || options.language || 'en',
      words,
      captions,
      audioUri: audioFile.uri,
    };
  } finally {
    await context.release();
  }
}

function normalizeWordSegments(
  segments: Array<{ text: string; t0: number; t1: number }>,
): WordToken[] {
  const words: WordToken[] = [];

  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text || /^\[[^\]]+\]$/.test(text)) continue;

    const startMs = Math.max(0, segment.t0 * 10);
    const endMs = Math.max(startMs + 10, segment.t1 * 10);
    words.push({
      id: `word-${words.length + 1}`,
      text,
      startMs,
      endMs,
    });
  }

  return words;
}
