export type TranscriptionModel = {
  id: 'fast' | 'balanced' | 'accurate';
  label: string;
  description: string;
  fileName: string;
  downloadUrl: string;
  downloadBytes: number;
  sha256: string;
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
    sha256: 'c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Base English, the default quality/speed choice.',
    fileName: 'ggml-base.en-q5_1.bin',
    downloadUrl: `${MODEL_ROOT}/ggml-base.en-q5_1.bin`,
    downloadBytes: 59_721_011,
    sha256: '4baf70dd0d7c4247ba2b81fafd9c01005ac77c2f9ef064e00dcf195d0e2fdd2f',
  },
  {
    id: 'accurate',
    label: 'Accurate',
    description: 'Small English, slower and intended for higher-memory phones.',
    fileName: 'ggml-small.en-q5_1.bin',
    downloadUrl: `${MODEL_ROOT}/ggml-small.en-q5_1.bin`,
    downloadBytes: 190_098_681,
    sha256: 'bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30',
  },
];

export function getModel(modelId: TranscriptionModel['id']) {
  const model = TRANSCRIPTION_MODELS.find((item) => item.id === modelId);
  if (!model) throw new Error(`Unknown transcription model: ${modelId}`);
  return model;
}
