import type { WordToken } from '@/types/project';

export type WhisperTimedSegment = {
  text: string;
  t0: number;
  t1: number;
};

const CLOSING_PUNCTUATION = /^[,.;:!?%\u2026)\]}]+$/;
const NON_SPEECH = /^\s*(?:\[[^\]]+\]|\([^)]*\))\s*$/;

type PendingWord = Omit<WordToken, 'id'>;

export function coalesceWhisperWords(segments: WhisperTimedSegment[]): WordToken[] {
  const words: PendingWord[] = [];
  let pending: PendingWord | undefined;

  const flush = () => {
    if (pending?.text.trim()) words.push(pending);
    pending = undefined;
  };

  for (const segment of segments) {
    const rawText = segment.text.replace(/\u00a0/g, ' ');
    if (!rawText.trim() || NON_SPEECH.test(rawText)) continue;

    const pieces = rawText.trim().split(/\s+/).filter(Boolean);
    const segmentStartMs = Math.max(0, segment.t0 * 10);
    const segmentEndMs = Math.max(segmentStartMs + 10, segment.t1 * 10);
    const durationMs = segmentEndMs - segmentStartMs;
    const totalWeight = pieces.reduce((total, piece) => total + Math.max(1, piece.length), 0);
    let consumedWeight = 0;

    pieces.forEach((piece, index) => {
      const weight = Math.max(1, piece.length);
      const startMs = segmentStartMs + Math.round(durationMs * consumedWeight / totalWeight);
      consumedWeight += weight;
      const endMs = segmentStartMs + Math.round(durationMs * consumedWeight / totalWeight);
      const beginsLexicalWord = index > 0 || /^\s/.test(rawText);
      const attachesToPrevious = Boolean(pending) && (!beginsLexicalWord || CLOSING_PUNCTUATION.test(piece));

      if (attachesToPrevious && pending) {
        pending.text += piece;
        pending.endMs = Math.max(pending.endMs, endMs);
        return;
      }

      flush();
      pending = {
        text: piece,
        startMs,
        endMs: Math.max(startMs + 10, endMs),
      };
    });
  }

  flush();
  return words.map((word, index) => ({ ...word, id: `word-${index + 1}` }));
}
