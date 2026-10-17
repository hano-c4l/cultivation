export interface ChatLimit {
  burst: number;
  windowMs: number;
  minGapMs: number;
}

/**
 * Sliding-window check for one sender and one channel. `times` are the timestamps of the sender's earlier lines.
 * Returns the timestamps to keep (including `now`) when the line is allowed, or null when it is too soon or the
 * window is full. The caller stores the result; a refused line is not recorded.
 */
export function checkChatRate(times: readonly number[], now: number, limit: ChatLimit): number[] | null {
  const recent = times.filter((t) => now - t < limit.windowMs);
  const last = recent[recent.length - 1];
  if (recent.length >= limit.burst || (last !== undefined && now - last < limit.minGapMs)) return null;
  return [...recent, now];
}
