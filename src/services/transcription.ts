import { Directory, File, Paths } from 'expo-file-system';
import { initWhisper, initWhisperVad } from 'whisper.rn/index';

import CaptionMedia from '../../modules/caption-media/src/CaptionMediaModule';
import { groupWordsIntoCaptions } from '@/lib/caption-grouping';
import { getModel, type TranscriptionModel } from '@/lib/model-catalog';
import { alignWordsToSpeech } from '@/lib/speech-alignment';
import { PREPARING_AUDIO_CUES } from '@/lib/transcription-progress';
import type { CaptionBlock, WordToken } from '@/types/project';

export type TranscriptionStage =
  | 'preparing-audio'
  | 'downloading-model'
  | 'detecting-speech'
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

const VAD_MODEL = {
  fileName: 'ggml-silero-v6.2.0.bin',
  downloadBytes: 885_098,
  downloadUrl: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin',
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

async function ensureVadModel(onProgress?: (progress: TranscriptionProgress) => void): Promise<File> {
  const modelDirectory = new Directory(Paths.document, 'models');
  modelDirectory.create({ idempotent: true, intermediates: true });
  const modelFile = new File(modelDirectory, VAD_MODEL.fileName);
  if (modelFile.exists && modelFile.size === VAD_MODEL.downloadBytes) return modelFile;

  onProgress?.({
    stage: 'downloading-model',
    progress: 0,
    detail: 'Downloading the small offline silence detector once',
  });
  await File.downloadFileAsync(VAD_MODEL.downloadUrl, modelFile, {
    idempotent: true,
    onProgress: ({ bytesWritten, totalBytes }) => onProgress?.({
      stage: 'downloading-model',
      progress: Math.min(1, bytesWritten / Math.max(1, totalBytes || VAD_MODEL.downloadBytes)),
      detail: 'Downloading offline silence detector',
    }),
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

  let audioPreparationFinished = false;
  const preparationCueTimers = [
    setTimeout(() => {
      if (audioPreparationFinished) return;
      onProgress?.({
        stage: 'preparing-audio',
        progress: PREPARING_AUDIO_CUES[0].progress,
        detail: 'Extracting audio on this phone',
      });
    }, PREPARING_AUDIO_CUES[0].afterMs),
    setTimeout(() => {
      if (audioPreparationFinished) return;
      onProgress?.({
        stage: 'preparing-audio',
        progress: PREPARING_AUDIO_CUES[1].progress,
        detail: 'Still preparing audio — longer videos can take a minute',
      });
    }, PREPARING_AUDIO_CUES[1].afterMs),
  ];

  try {
    await CaptionMedia.extractAudioToWav(videoUri, audioFile.uri);
  } finally {
    audioPreparationFinished = true;
    preparationCueTimers.forEach(clearTimeout);
  }
  onProgress?.({
    stage: 'preparing-audio',
    progress: 1,
    detail: 'Audio ready',
  });

  const [modelFile, vadModelFile] = await Promise.all([
    ensureModel(modelId, onProgress),
    ensureVadModel(onProgress),
  ]);
  onProgress?.({
    stage: 'detecting-speech',
    progress: 0,
    detail: 'Finding spoken sections and ignoring silence',
  });
  const vadContext = await initWhisperVad({
    filePath: vadModelFile.uri,
    useGpu: false,
    nThreads: 4,
  });
  let speechSegments: { t0: number; t1: number }[];
  try {
    speechSegments = await vadContext.detectSpeech(audioFile.uri, {
      threshold: 0.42,
      minSpeechDurationMs: 180,
      minSilenceDurationMs: 280,
      maxSpeechDurationS: 29,
      speechPadMs: 90,
      samplesOverlap: 0.1,
    });
  } finally {
    await vadContext.release();
  }
  if (speechSegments.length === 0) {
    throw new Error('No speech was detected in this video. Try a clip with clearer spoken audio.');
  }
  onProgress?.({
    stage: 'detecting-speech',
    progress: 1,
    detail: `Found ${speechSegments.length} spoken section${speechSegments.length === 1 ? '' : 's'}`,
  });
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

    const words = alignWordsToSpeech(normalizeWordSegments(result.segments), speechSegments);
    if (words.length === 0) {
      throw new Error('Speech was detected, but no reliable words were found. Try the Balanced model or clearer audio.');
    }
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
  segments: { text: string; t0: number; t1: number }[],
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
