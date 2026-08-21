import type { CaptionProject, VideoClip, VisualLayer, WordToken } from '@/types/project';

export type ClipTimelineEntry = { clip: VideoClip; startMs: number; endMs: number };

export function buildClipTimeline(clips: VideoClip[]): ClipTimelineEntry[] {
  let cursor = 0;
  return clips.map((clip) => {
    const startMs = cursor;
    cursor += clipTimelineDuration(clip);
    return { clip, startMs, endMs: cursor };
  });
}

export function timelineEntryAt(entries: ClipTimelineEntry[], timelineMs: number) {
  if (entries.length === 0) return undefined;
  return entries.find((entry) => timelineMs >= entry.startMs && timelineMs < entry.endMs)
    ?? (timelineMs >= entries[entries.length - 1].endMs ? entries[entries.length - 1] : entries[0]);
}

export function totalClipDuration(clips: VideoClip[]) {
  return clips.reduce((total, clip) => total + clipTimelineDuration(clip), 0);
}

export function clipTimelineDuration(clip: VideoClip) {
  return Math.max(0, clip.sourceEndMs - clip.sourceStartMs) / validPlaybackRate(clip.playbackRate);
}

export function sourceTimeAt(entry: ClipTimelineEntry, timelineMs: number) {
  return entry.clip.sourceStartMs
    + clamp(timelineMs - entry.startMs, 0, entry.endMs - entry.startMs) * validPlaybackRate(entry.clip.playbackRate);
}

export function timelineTimeAt(entry: ClipTimelineEntry, sourceMs: number) {
  return entry.startMs
    + clamp(sourceMs - entry.clip.sourceStartMs, 0, entry.clip.sourceEndMs - entry.clip.sourceStartMs)
      / validPlaybackRate(entry.clip.playbackRate);
}

export function clipPlaybackVolume(clip: VideoClip, timelineOffsetMs: number) {
  if (clip.muted) return 0;
  const duration = clipTimelineDuration(clip);
  const fadeIn = clip.fadeInMs > 0 ? clamp(timelineOffsetMs / clip.fadeInMs, 0, 1) : 1;
  const fadeOut = clip.fadeOutMs > 0 ? clamp((duration - timelineOffsetMs) / clip.fadeOutMs, 0, 1) : 1;
  return clamp(clip.volume * Math.min(fadeIn, fadeOut), 0, 1);
}

export function mapSourceWordsToTimeline(
  clips: VideoClip[],
  sourceWords: Record<string, WordToken[]>,
) {
  const timelineWords: WordToken[] = [];
  for (const entry of buildClipTimeline(clips)) {
    const rate = validPlaybackRate(entry.clip.playbackRate);
    for (const word of sourceWords[entry.clip.sourceId] ?? []) {
      const clippedStart = Math.max(word.startMs, entry.clip.sourceStartMs);
      const clippedEnd = Math.min(word.endMs, entry.clip.sourceEndMs);
      if (clippedEnd <= clippedStart) continue;
      timelineWords.push({
        ...word,
        id: `${entry.clip.id}-${word.id}`,
        startMs: entry.startMs + (clippedStart - entry.clip.sourceStartMs) / rate,
        endMs: entry.startMs + (clippedEnd - entry.clip.sourceStartMs) / rate,
      });
    }
  }
  return timelineWords;
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

export function setClipPlaybackRate(project: CaptionProject, clipId: string, playbackRate: number) {
  const entries = buildClipTimeline(project.clips);
  const entry = entries.find((candidate) => candidate.clip.id === clipId);
  if (!entry) return project;
  const rate = validPlaybackRate(playbackRate);
  if (rate === entry.clip.playbackRate) return project;
  const replacement = { ...entry.clip, playbackRate: rate };
  const replacementDuration = clipTimelineDuration(replacement);
  const oldDuration = entry.endMs - entry.startMs;
  const delta = replacementDuration - oldDuration;
  const mapTime = (timeMs: number) => {
    if (timeMs <= entry.startMs) return timeMs;
    if (timeMs >= entry.endMs) return timeMs + delta;
    return entry.startMs + (timeMs - entry.startMs) * replacementDuration / Math.max(1, oldDuration);
  };
  const words = project.transcription.words.map((word) => ({ ...word, startMs: mapTime(word.startMs), endMs: mapTime(word.endMs) }));
  const captions = project.captions.map((caption) => ({ ...caption, startMs: mapTime(caption.startMs), endMs: mapTime(caption.endMs) }));
  const layers = project.layers.map((layer) => layer.kind === 'captions'
    ? layer
    : { ...layer, startMs: mapTime(layer.startMs), endMs: mapTime(layer.endMs) });
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    clips: project.clips.map((clip) => clip.id === clipId ? replacement : clip),
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

function validPlaybackRate(rate: number) {
  return clamp(Number.isFinite(rate) ? rate : 1, 0.25, 4);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
