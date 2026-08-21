export const MIN_TIMELINE_PIXELS_PER_SECOND = 0.5;
export const MAX_TIMELINE_PIXELS_PER_SECOND = 240;

export function minimumTimelineScale(durationMs: number, viewportWidth: number) {
  const seconds = Math.max(0.001, durationMs / 1000);
  return clamp(viewportWidth / seconds, MIN_TIMELINE_PIXELS_PER_SECOND, 32);
}

export function timelineWidth(durationMs: number, pixelsPerSecond: number, viewportWidth: number) {
  return Math.max(viewportWidth, durationMs / 1000 * pixelsPerSecond);
}

export function timelineTickInterval(pixelsPerSecond: number) {
  const intervals = [100, 250, 500, 1_000, 2_000, 5_000, 10_000, 30_000, 60_000, 120_000, 300_000];
  return intervals.find((interval) => interval / 1000 * pixelsPerSecond >= 56) ?? intervals.at(-1)!;
}

export function timelineZoomPercent(scale: number, minimum: number) {
  if (minimum >= MAX_TIMELINE_PIXELS_PER_SECOND) return 100;
  const normalized = Math.log(scale / minimum) / Math.log(MAX_TIMELINE_PIXELS_PER_SECOND / minimum);
  return Math.round(clamp(normalized, 0, 1) * 100);
}

export function clampTimelineScale(scale: number, minimum: number) {
  return clamp(scale, minimum, MAX_TIMELINE_PIXELS_PER_SECOND);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
