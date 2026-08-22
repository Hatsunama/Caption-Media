import type { CaptionBlock, WordToken } from '@/types/project';

export type CaptionGroupingOptions = {
  maxWords: number;
  maxCharacters: number;
  maxDurationMs: number;
  pauseBreakMs: number;
};

export const DEFAULT_GROUPING_OPTIONS: CaptionGroupingOptions = {
  maxWords: 7,
  maxCharacters: 34,
  maxDurationMs: 3_200,
  pauseBreakMs: 650,
};

const HARD_BREAK = /[.!?][\]"')]*$/;

export function groupWordsIntoCaptions(
  words: WordToken[],
  options: CaptionGroupingOptions = DEFAULT_GROUPING_OPTIONS,
): CaptionBlock[] {
  const groups: WordToken[][] = [];
  let current: WordToken[] = [];

  const flush = () => {
    if (current.length > 0) groups.push(current);
    current = [];
  };

  for (const word of words) {
    const candidate = [...current, word];
    const candidateText = joinWords(candidate);
    const duration = candidate.at(-1)!.endMs - candidate[0]!.startMs;
    const previous = current.at(-1);
    const pause = previous ? word.startMs - previous.endMs : 0;

    const mustBreakBefore =
      current.length > 0 &&
      (candidate.length > options.maxWords ||
        candidateText.length > options.maxCharacters ||
        duration > options.maxDurationMs ||
        pause >= options.pauseBreakMs);

    if (mustBreakBefore) flush();
    current.push(word);

    if (HARD_BREAK.test(word.text)) flush();
  }

  flush();

  return groups.map((group, index) => ({
    id: `caption-${index + 1}`,
    text: joinWords(group),
    startMs: group[0].startMs,
    endMs: group.at(-1)!.endMs,
    wordIds: group.map((word) => word.id),
    textMode: 'automatic',
    timelineVisible: true,
  }));
}

export function groupTimelineWordsByClip(
  words: WordToken[],
  clipIds: string[],
  options: CaptionGroupingOptions = DEFAULT_GROUPING_OPTIONS,
) {
  return clipIds.flatMap((clipId) => groupWordsIntoCaptions(
    words.filter((word) => word.id.startsWith(`${clipId}-`)),
    options,
  ).map((caption, index) => ({ ...caption, id: `caption-${clipId}-${index + 1}` })));
}

export function joinWords(words: WordToken[]): string {
  return words
    .map((word) => word.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([([{])\s+/g, '$1')
    .trim();
}
