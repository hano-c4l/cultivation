import { describe, expect, it } from "vitest";
import { checkChatRate, retryAfterMs } from "./chat";
import { WORLD_CHAT_BURST, WORLD_CHAT_MIN_GAP_MS, WORLD_CHAT_WINDOW_MS } from "./protocol";

const world = { burst: WORLD_CHAT_BURST, windowMs: WORLD_CHAT_WINDOW_MS, minGapMs: WORLD_CHAT_MIN_GAP_MS };

describe("checkChatRate", () => {
  it("allows the first line and records it", () => {
    expect(checkChatRate([], 1000, world)).toEqual([1000]);
  });

  it("refuses a line that comes before the minimum gap, without recording it", () => {
    expect(checkChatRate([1000], 1000 + WORLD_CHAT_MIN_GAP_MS - 1, world)).toBeNull();
    expect(checkChatRate([1000], 1000 + WORLD_CHAT_MIN_GAP_MS, world)).toEqual([1000, 1000 + WORLD_CHAT_MIN_GAP_MS]);
  });

  it("refuses once the window holds the burst, and allows again when the oldest line leaves the window", () => {
    const t0 = 10_000;
    const full = [t0, t0 + 5_000, t0 + 10_000];
    expect(checkChatRate(full, t0 + 15_000, world)).toBeNull();
    // 60 s after the first line it no longer counts.
    expect(checkChatRate(full, t0 + WORLD_CHAT_WINDOW_MS, world)).toEqual([t0 + 5_000, t0 + 10_000, t0 + WORLD_CHAT_WINDOW_MS]);
  });

  it("forgets lines older than the window", () => {
    expect(checkChatRate([1, 2, 3], 1_000_000, world)).toEqual([1_000_000]);
  });
});

describe("retryAfterMs", () => {
  const sortLimit = { burst: 3, windowMs: 60_000, minGapMs: 1_000 };

  it("is 0 when a line is allowed now", () => {
    expect(retryAfterMs([], 1000, sortLimit)).toBe(0);
    expect(retryAfterMs([1000], 1000 + 1_000, sortLimit)).toBe(0);
  });

  it("is the rest of the minimum gap right after a line", () => {
    expect(retryAfterMs([10_000], 10_300, sortLimit)).toBe(700);
  });

  it("with a full window it is the time until the oldest of the last burst leaves it", () => {
    const times = [0, 20_000, 40_000]; // three sorts in a minute
    expect(retryAfterMs(times, 45_000, sortLimit)).toBe(15_000); // the first one leaves at 60 s
    // The answer agrees with checkChatRate: refused just before, allowed right at the end.
    expect(checkChatRate(times, 45_000 + 15_000 - 1, sortLimit)).toBeNull();
    expect(checkChatRate(times, 45_000 + 15_000, sortLimit)).not.toBeNull();
  });

  it("ignores lines that already left the window", () => {
    expect(retryAfterMs([0, 5_000, 6_000], 100_000, sortLimit)).toBe(0);
  });
});
