import type { CaptionProject, VideoClip, VisualLayer } from '@/types/project';

export type ClipTimelineEntry = { clip: VideoClip; startMs: number; endMs: number };

export function buildClipTimeline(clips: VideoClip[]): ClipTimelineEntry[] {
  let cursor = 0;
  return clips.map((clip) => {
    const startMs = cursor;
    cursor += Math.max(0, clip.sourceEndMs - clip.sourceStartMs);
    return { clip, startMs, endMs: cursor };
  });
}

export function timelineEntryAt(entries: ClipTimelineEntry[], timelineMs: number) {
  if (entries.length === 0) return undefined;
  return entries.find((entry) => timelineMs >= entry.startMs && timelineMs < entry.endMs)
    ?? (timelineMs >= entries[entries.length - 1].endMs ? entries[entries.length - 1] : entries[0]);
}

export function totalClipDuration(clips: VideoClip[]) {
  return clips.reduce((total, clip) => total + Math.max(0, clip.sourceEndMs - clip.sourceStartMs), 0);
}

export function rippleDelete(project: CaptionProject, cutStartMs: number, cutEndMs: number, clipId: string): CaptionProject {
  const rippled = rippleTimedContent(project, cutStartMs, cutEndMs);
  return {
    ...rippled,
    clips: project.clips.filter((clip) => clip.id !== clipId),
  };
}

export function rippleTimedContent(project: CaptionProject, cutStartMs: number, cutEndMs: number): CaptionProject {
  const words = project.transcription.words
    .map((word) => {
      const range = rippleRange(word.startMs, word.endMs, cutStartMs, cutEndMs);
      return range ? { ...word, ...range } : undefined;
    })
    .filter((word): word is NonNullable<typeof word> => Boolean(word));
  const wordMap = new Map(words.map((word) => [word.id, word]));
  const captions = project.captions
    .map((caption) => {
      const range = rippleRange(caption.startMs, caption.endMs, cutStartMs, cutEndMs);
      if (!range) return undefined;
      const wordIds = caption.wordIds.filter((id) => wordMap.has(id));
      const text = wordIds.length > 0 ? wordIds.map((id) => wordMap.get(id)?.text).filter(Boolean).join(' ') : caption.text;
      return { ...caption, ...range, wordIds, text };
    })
    .filter((caption): caption is NonNullable<typeof caption> => Boolean(caption));
  const layers = project.layers
    .map((layer) => {
      if (layer.kind === 'captions') return layer;
      const range = rippleRange(layer.startMs, layer.endMs, cutStartMs, cutEndMs);
      return range ? { ...layer, ...range } : undefined;
    })
    .filter((layer): layer is VisualLayer => Boolean(layer));
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    transcription: { ...project.transcription, words },
    captions,
    layers,
  };
}

function rippleRange(startMs: number, endMs: number, cutStartMs: number, cutEndMs: number) {
  const removed = Math.max(0, cutEndMs - cutStartMs);
  if (endMs <= cutStartMs) return { startMs, endMs };
  if (startMs >= cutEndMs) return { startMs: startMs - removed, endMs: endMs - removed };
  if (startMs < cutStartMs && endMs > cutEndMs) return { startMs, endMs: endMs - removed };
  if (startMs < cutStartMs) {
    const next = { startMs, endMs: cutStartMs };
    return next.endMs - next.startMs >= 80 ? next : undefined;
  }
  if (endMs > cutEndMs) {
    const next = { startMs: cutStartMs, endMs: endMs - removed };
    return next.endMs - next.startMs >= 80 ? next : undefined;
  }
  return undefined;
}
