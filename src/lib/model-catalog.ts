export type TranscriptionModel = {
  id: 'fast' | 'balanced' | 'accurate';
  label: string;
  description: string;
  fileName: string;
  downloadUrl: string;
  downloadBytes: number;
};

const MODEL_ROOT = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

export const TRANSCRIPTION_MODELS: TranscriptionModel[] = [
  {
    id: 'fast',
    label: 'Fast',
    description: 'Tiny English, best for quick drafts and lower-memory phones.',
    fileName: 'ggml-tiny.en-q5_1.bin',
    downloadUrl: `${MODEL_ROOT}/ggml-tiny.en-q5_1.bin`,
    downloadBytes: 32_166_155,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Base English, the default quality/speed choice.',
    fileName: 'ggml-base.en-q5_1.bin',
    downloadUrl: `${MODEL_ROOT}/ggml-base.en-q5_1.bin`,
    downloadBytes: 59_721_011,
  },
  {
    id: 'accurate',
    label: 'Accurate',
    description: 'Small English, slower and intended for higher-memory phones.',
    fileName: 'ggml-small.en-q5_1.bin',
    downloadUrl: `${MODEL_ROOT}/ggml-small.en-q5_1.bin`,
    downloadBytes: 190_098_681,
  },
];

export function getModel(modelId: TranscriptionModel['id']) {
  const model = TRANSCRIPTION_MODELS.find((item) => item.id === modelId);
  if (!model) throw new Error(`Unknown transcription model: ${modelId}`);
  return model;
}
