export type TimelineInterval = { id: string; startMs: number; endMs: number };

export function packTimelineLanes(intervals: TimelineInterval[]) {
  const laneEnds: number[] = [];
  const laneById = new Map<string, number>();
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.id.localeCompare(b.id));

  for (const interval of sorted) {
    let lane = laneEnds.findIndex((endMs) => interval.startMs >= endMs);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(interval.endMs);
    } else {
      laneEnds[lane] = interval.endMs;
    }
    laneById.set(interval.id, lane);
  }

  return { laneById, laneCount: Math.max(1, laneEnds.length) };
}
