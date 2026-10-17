export interface ChatLimit {
  burst: number;
  windowMs: number;
  minGapMs: number;
}

/**
 * How long until a line would be allowed again (0 when it is allowed now): the longer of the minimum gap since the last
 * line and, when the window is full, the time until the line that fills the last slot leaves the window.
 */
export function retryAfterMs(times: readonly number[], now: number, limit: ChatLimit): number {
  const recent = times.filter((t) => now - t < limit.windowMs);
  let wait = 0;
  const last = recent[recent.length - 1];
  if (last !== undefined) wait = Math.max(wait, last + limit.minGapMs - now);
  if (recent.length >= limit.burst) wait = Math.max(wait, recent[recent.length - limit.burst]! + limit.windowMs - now);
  return Math.max(0, Math.ceil(wait));
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
