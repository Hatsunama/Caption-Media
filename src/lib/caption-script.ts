import type { CaptionBlock, WordToken } from '@/types/project';

const MINIMUM_CAPTION_MS = 80;

export type CaptionScriptMutation = {
  captions: CaptionBlock[];
  focusedId: string;
};

export function updateCaptionScriptText(captions: CaptionBlock[], captionId: string, requestedText: string) {
  return captions.map((caption) => caption.id === captionId
    ? { ...caption, text: requestedText, textMode: 'manual' as const }
    : caption);
}

export function splitCaptionScriptBlock(
  captions: CaptionBlock[],
  captionId: string,
  cursor: number,
  words: WordToken[],
  newCaptionId: string,
): CaptionScriptMutation | null {
  const index = captions.findIndex((caption) => caption.id === captionId);
  if (index < 0 || captions.some((caption) => caption.id === newCaptionId)) return null;
  const caption = captions[index];
  const beforeText = normalizeText(caption.text.slice(0, cursor));
  const afterText = normalizeText(caption.text.slice(cursor));
  if (!beforeText || !afterText || caption.endMs - caption.startMs < MINIMUM_CAPTION_MS * 2) return null;

  const wordById = new Map(words.map((word) => [word.id, word]));
  const timedWordIds = caption.wordIds.filter((wordId) => wordById.has(wordId));
  const splitIndex = wordSplitIndex(caption.text, cursor, timedWordIds.length);
  const leftWordIds = timedWordIds.slice(0, splitIndex);
  const rightWordIds = timedWordIds.slice(splitIndex);
  const leftWord = wordById.get(leftWordIds.at(-1) ?? '');
  const rightWord = wordById.get(rightWordIds[0] ?? '');
  const proportionalTime = caption.startMs
    + (caption.endMs - caption.startMs) * clamp(cursor / Math.max(1, caption.text.length), 0, 1);
  const timedBoundary = leftWord && rightWord ? (leftWord.endMs + rightWord.startMs) / 2 : proportionalTime;
  const splitMs = clamp(timedBoundary, caption.startMs + MINIMUM_CAPTION_MS, caption.endMs - MINIMUM_CAPTION_MS);
  const sourceSplitMs = caption.sourceAnchor
    ? caption.sourceAnchor.sourceStartMs
      + (caption.sourceAnchor.sourceEndMs - caption.sourceAnchor.sourceStartMs)
        * (splitMs - caption.startMs) / Math.max(1, caption.endMs - caption.startMs)
    : undefined;

  const left: CaptionBlock = {
    ...caption,
    text: beforeText,
    textMode: 'manual',
    endMs: splitMs,
    wordIds: leftWordIds,
    sourceAnchor: caption.sourceAnchor && sourceSplitMs != null
      ? { ...caption.sourceAnchor, sourceEndMs: sourceSplitMs, wordIds: leftWordIds }
      : undefined,
  };
  const right: CaptionBlock = {
    ...caption,
    id: newCaptionId,
    text: afterText,
    textMode: 'manual',
    startMs: splitMs,
    wordIds: rightWordIds,
    sourceAnchor: caption.sourceAnchor && sourceSplitMs != null
      ? { ...caption.sourceAnchor, sourceStartMs: sourceSplitMs, wordIds: rightWordIds }
      : undefined,
  };
  const next = [...captions];
  next.splice(index, 1, left, right);
  return { captions: next, focusedId: right.id };
}

export function mergeCaptionScriptBlock(
  captions: CaptionBlock[],
  captionId: string,
): CaptionScriptMutation | { blockedByVideoCut: true } | null {
  const index = captions.findIndex((caption) => caption.id === captionId);
  if (index <= 0) return null;
  const previous = captions[index - 1];
  const current = captions[index];
  if (
    previous.sourceAnchor
    && current.sourceAnchor
    && previous.sourceAnchor.clipId !== current.sourceAnchor.clipId
  ) return { blockedByVideoCut: true };

  const wordIds = [...previous.wordIds, ...current.wordIds];
  const sourceAnchor = previous.sourceAnchor && current.sourceAnchor
    ? {
        ...previous.sourceAnchor,
        sourceStartMs: Math.min(previous.sourceAnchor.sourceStartMs, current.sourceAnchor.sourceStartMs),
        sourceEndMs: Math.max(previous.sourceAnchor.sourceEndMs, current.sourceAnchor.sourceEndMs),
        wordIds,
      }
    : undefined;
  const merged: CaptionBlock = {
    ...previous,
    text: normalizeText(`${previous.text} ${current.text}`),
    textMode: 'manual',
    endMs: Math.max(previous.endMs, current.endMs),
    wordIds,
    sourceAnchor,
    timelineVisible: true,
  };
  const next = [...captions];
  next.splice(index - 1, 2, merged);
  return { captions: next, focusedId: merged.id };
}

function wordSplitIndex(text: string, cursor: number, wordCount: number) {
  if (wordCount < 2) return 0;
  const beforeCount = normalizeText(text.slice(0, cursor)).split(/\s+/).filter(Boolean).length;
  const totalCount = normalizeText(text).split(/\s+/).filter(Boolean).length;
  if (totalCount === wordCount && beforeCount > 0 && beforeCount < wordCount) return beforeCount;
  return clamp(Math.round(wordCount * cursor / Math.max(1, text.length)), 1, wordCount - 1);
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
