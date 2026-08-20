import { DEFAULT_CAPTION_STYLE, type CaptionProject } from '@/types/project';

export function createCaptionProject(options: {
  id: string;
  name: string;
  source: {
    uri: string;
    storageMode: 'linked' | 'copied';
    thumbnailUri?: string;
    sizeBytes?: number;
    mimeType?: string;
    durationMs: number;
    width: number;
    height: number;
    rotation: number;
  };
}): CaptionProject {
  const now = new Date().toISOString();
  const displaySize = orientedSize(options.source.width, options.source.height, options.source.rotation);
  return {
    schemaVersion: 1,
    id: options.id,
    name: options.name,
    createdAt: now,
    updatedAt: now,
    source: {
      ...options.source,
      displayName: options.name,
    },
    transcription: {
      language: 'en',
      modelId: 'fast',
      words: [],
    },
    captions: [],
    projectStyle: DEFAULT_CAPTION_STYLE,
    layers: [{ id: 'captions', kind: 'captions', name: 'Captions', visible: true }],
    clips: [{ id: 'source-clip', sourceStartMs: 0, sourceEndMs: options.source.durationMs }],
    canvas: {
      preset: 'source',
      aspectWidth: displaySize.width,
      aspectHeight: displaySize.height,
      backgroundColor: '#000000',
    },
    videoTransform: {
      fit: 'fit',
      position: { x: 0.5, y: 0.5 },
      scale: 1,
      rotation: 0,
    },
    videoEdits: [],
    export: {
      resolution: '1080p',
      format: 'mp4',
      burnCaptions: true,
    },
  };
}

function orientedSize(width: number, height: number, rotation: number) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  return Math.abs(rotation) % 180 === 90
    ? { width: safeHeight, height: safeWidth }
    : { width: safeWidth, height: safeHeight };
}
