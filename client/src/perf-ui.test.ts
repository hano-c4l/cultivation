import { describe, expect, it } from "vitest";
import { summarizeFrames, textureBytes } from "./perf-ui";

describe("frame summary", () => {
  it("is zeros for nothing", () => {
    expect(summarizeFrames([])).toEqual({ frames: 0, avgFps: 0, lowFps: 0, worstMs: 0 });
  });

  it("a steady 60 fps run has equal average and low", () => {
    const s = summarizeFrames(Array.from({ length: 300 }, () => 1000 / 60));
    expect(s.avgFps).toBeCloseTo(60, 5);
    expect(s.lowFps).toBeCloseTo(60, 5);
  });

  it("one long frame in a hundred drags the 1% low far below the average", () => {
    const times = [...Array.from({ length: 99 }, () => 16), 200];
    const s = summarizeFrames(times);
    expect(s.avgFps).toBeGreaterThan(50);
    expect(s.lowFps).toBeCloseTo(5, 5);
    expect(s.worstMs).toBe(200);
  });
});

describe("texture memory", () => {
  it("is four bytes a pixel", () => {
    expect(textureBytes(1024, 1024)).toBe(4 * 1024 * 1024);
    expect(textureBytes(0, 100)).toBe(0);
  });
});
