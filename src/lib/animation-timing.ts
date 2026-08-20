export function spokenAnimationClock(options: {
  currentMs: number;
  captionStartMs: number;
  captionEndMs: number;
  animationDurationMs: number;
  activeWord?: { startMs: number; endMs: number };
}) {
  const { activeWord } = options;
  const elapsed = Math.max(0, options.currentMs - (activeWord?.startMs ?? options.captionStartMs));
  const spokenWindowMs = activeWord
    ? Math.max(80, activeWord.endMs - activeWord.startMs)
    : Math.max(80, Math.min(options.animationDurationMs, options.captionEndMs - options.captionStartMs));
  return {
    entryProgress: activeWord
      ? clamp(elapsed / Math.min(spokenWindowMs, Math.max(80, options.animationDurationMs)), 0, 1)
      : 0,
    wordProgress: activeWord ? clamp(elapsed / spokenWindowMs, 0, 1) : 0,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
