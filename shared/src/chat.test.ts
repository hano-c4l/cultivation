import { describe, expect, it } from "vitest";
import { checkChatRate } from "./chat";
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
