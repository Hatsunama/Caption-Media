import { mergeStyle } from '@/lib/style-resolver';
import { buildClipTimeline, rippleTimedContent, sourceTimeAt } from '@/lib/video-timeline';
import {
  DEFAULT_CAPTION_STYLE,
  type CaptionProject,
  type CaptionStylePatch,
  type ImageVisualLayer,
  type TextVisualLayer,
  type VideoClip,
} from '@/types/project';

export function setCaptionText(project: CaptionProject, captionId: string, text: string) {
  return updateProject(project, {
    captions: project.captions.map((caption) => caption.id === captionId ? { ...caption, text: text.trim() } : caption),
  });
}

export function setTextLayerText(project: CaptionProject, layerId: string, text: string) {
  const value = text.trim() || 'Text';
  return updateProject(project, {
    layers: project.layers.map((layer) => layer.id === layerId && layer.kind === 'text'
      ? { ...layer, text: value, name: value.slice(0, 18) }
      : layer),
  });
}

export function setTextLayerStyle(project: CaptionProject, layerId: string, patch: CaptionStylePatch) {
  return updateProject(project, {
    layers: project.layers.map((layer) => layer.id === layerId && layer.kind === 'text'
      ? { ...layer, style: mergeStyle(layer.style, patch) }
      : layer),
  });
}

export function setVideoTransform(project: CaptionProject, patch: Partial<CaptionProject['videoTransform']>) {
  return updateProject(project, { videoTransform: { ...project.videoTransform, ...patch } });
}

export function setCaptionTiming(project: CaptionProject, captionId: string, startMs: number, endMs: number) {
  return updateProject(project, {
    captions: project.captions.map((caption) => caption.id === captionId ? { ...caption, startMs, endMs } : caption),
  });
}

export function setLayerTiming(project: CaptionProject, layerId: string, startMs: number, endMs: number) {
  return updateProject(project, {
    layers: project.layers.map((layer) => layer.id === layerId && layer.kind !== 'captions'
      ? { ...layer, startMs, endMs }
      : layer),
  });
}

export function setImageLayer(project: CaptionProject, layerId: string, patch: Partial<ImageVisualLayer>) {
  return updateProject(project, {
    layers: project.layers.map((layer) => layer.id === layerId && layer.kind === 'image'
      ? { ...layer, ...patch }
      : layer),
  });
}

export function createTextLayer(project: CaptionProject, id: string, currentMs: number, durationMs: number) {
  const startMs = clamp(currentMs, 0, Math.max(0, durationMs - 500));
  const layer: TextVisualLayer = {
    id,
    kind: 'text',
    name: 'New Text',
    visible: true,
    text: 'New text',
    startMs,
    endMs: Math.min(durationMs, startMs + 3_000),
    style: mergeStyle(DEFAULT_CAPTION_STYLE, {
      position: { x: 0.5, y: 0.48 },
      box: { width: 0.72, height: 0.18 },
      animation: { id: 'none' },
    }),
  };
  const firstImage = project.layers.findIndex((item) => item.kind === 'image');
  const insertion = firstImage < 0 ? project.layers.length : firstImage;
  const layers = [...project.layers];
  layers.splice(insertion, 0, layer);
  return { project: updateProject(project, { layers }), layer };
}

export function addImageLayer(project: CaptionProject, options: {
  id: string;
  name: string;
  uri: string;
  currentMs: number;
  durationMs: number;
}) {
  const startMs = clamp(options.currentMs, 0, Math.max(0, options.durationMs - 500));
  const layer: ImageVisualLayer = {
    id: options.id,
    kind: 'image',
    name: options.name.slice(0, 18) || 'Sticker',
    visible: true,
    uri: options.uri,
    startMs,
    endMs: Math.min(options.durationMs, startMs + 3_000),
    position: { x: 0.5, y: 0.5 },
    box: { width: 0.34, height: 0.24 },
    rotation: 0,
    opacity: 1,
  };
  return { project: updateProject(project, { layers: [...project.layers, layer] }), layer };
}

export function moveVisualLayer(project: CaptionProject, layerId: string, direction: -1 | 1) {
  const index = project.layers.findIndex((layer) => layer.id === layerId);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= project.layers.length) return project;
  const layers = [...project.layers];
  [layers[index], layers[destination]] = [layers[destination], layers[index]];
  return updateProject(project, { layers });
}

export function deleteVisualLayer(project: CaptionProject, layerId: string) {
  if (layerId === 'captions') return project;
  return updateProject(project, { layers: project.layers.filter((layer) => layer.id !== layerId) });
}

export function deleteCaptionBlock(project: CaptionProject, captionId: string) {
  return updateProject(project, { captions: project.captions.filter((caption) => caption.id !== captionId) });
}

export function updateVideoClip(project: CaptionProject, clipId: string, patch: Partial<VideoClip>) {
  return updateProject(project, {
    clips: project.clips.map((clip) => clip.id === clipId ? { ...clip, ...patch } : clip),
  });
}

export function splitVideoClip(project: CaptionProject, clipId: string, timelineMs: number, leftId: string, rightId: string) {
  const entry = buildClipTimeline(project.clips).find((candidate) => candidate.clip.id === clipId);
  if (!entry) return null;
  const sourceSplitMs = sourceTimeAt(entry, timelineMs);
  if (sourceSplitMs - entry.clip.sourceStartMs < 120 || entry.clip.sourceEndMs - sourceSplitMs < 120) return null;
  const left: VideoClip = { ...entry.clip, id: leftId, sourceEndMs: sourceSplitMs };
  const right: VideoClip = { ...entry.clip, id: rightId, sourceStartMs: sourceSplitMs };
  const clips = [...project.clips];
  const index = clips.findIndex((clip) => clip.id === clipId);
  clips.splice(index, 1, left, right);
  return { project: updateProject(project, { clips }), rightClipId: right.id };
}

export function trimVideoClip(project: CaptionProject, clipId: string, edge: 'start' | 'end', amountMs: number) {
  const entry = buildClipTimeline(project.clips).find((candidate) => candidate.clip.id === clipId);
  if (!entry || amountMs < 1) return null;
  const safeAmount = clamp(amountMs, 0, Math.max(0, entry.endMs - entry.startMs - 120));
  const sourceAmount = safeAmount * entry.clip.playbackRate;
  const cutStartMs = edge === 'start' ? entry.startMs : entry.endMs - safeAmount;
  const cutEndMs = edge === 'start' ? entry.startMs + safeAmount : entry.endMs;
  const rippled = rippleTimedContent(project, cutStartMs, cutEndMs);
  const clips = project.clips.map((clip) => clip.id === clipId
    ? edge === 'start'
      ? { ...clip, sourceStartMs: clip.sourceStartMs + sourceAmount }
      : { ...clip, sourceEndMs: clip.sourceEndMs - sourceAmount }
    : clip);
  return { project: updateProject(rippled, { clips }), seekMs: cutStartMs };
}

export function setCanvasPreset(project: CaptionProject, preset: CaptionProject['canvas']['preset']) {
  const size = canvasPresetSize(preset, project);
  return updateProject(project, {
    canvas: { ...project.canvas, preset, aspectWidth: size.width, aspectHeight: size.height },
  });
}

function canvasPresetSize(preset: CaptionProject['canvas']['preset'], project: CaptionProject) {
  if (preset === '9:16') return { width: 9, height: 16 };
  if (preset === '16:9') return { width: 16, height: 9 };
  if (preset === '1:1') return { width: 1, height: 1 };
  if (preset === '4:5') return { width: 4, height: 5 };
  const source = project.sources[0];
  const width = Math.max(1, source?.width ?? 9);
  const height = Math.max(1, source?.height ?? 16);
  return Math.abs(source?.rotation ?? 0) % 180 === 90 ? { width: height, height: width } : { width, height };
}

function updateProject<T extends Partial<CaptionProject>>(project: CaptionProject, update: T) {
  return { ...project, ...update, updatedAt: new Date().toISOString() } as CaptionProject;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
