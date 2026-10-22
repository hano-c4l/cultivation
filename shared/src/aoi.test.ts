import { describe, expect, it } from "vitest";
import { AOI_ENTER, AOI_LEAVE, diffView, withinView } from "./aoi";
import { screenToTile } from "./map";

const SIZE = 150;
const at = (px: number, py: number) => screenToTile(SIZE, px, py);

describe("area of interest", () => {
  it("measures distance on screen, not in tiles", () => {
    expect(withinView(SIZE, at(0, 0), at(AOI_ENTER.x, 0), AOI_ENTER)).toBe(true);
    expect(withinView(SIZE, at(0, 0), at(AOI_ENTER.x + 1, 0), AOI_ENTER)).toBe(false);
    expect(withinView(SIZE, at(0, 0), at(0, AOI_ENTER.y + 1), AOI_ENTER)).toBe(false);
  });

  it("tells a viewer what came into view and what left, with hysteresis", () => {
    const known = new Set<string>();
    const map = { width: SIZE };
    const e = (id: string, px: number, py = 0) => ({ id, pos: at(px, py) });
    let r = diffView(map, "me", at(0, 0), known, [e("me", 0), e("near", 10), e("far", 70)]);
    expect(r).toEqual({ enter: ["near"], leave: [] });
    // Just past the enter range but inside the leave range: still known, and an unknown one is not yet shown.
    r = diffView(map, "me", at(0, 0), known, [e("near", AOI_ENTER.x + 2), e("far", AOI_ENTER.x + 2, 0)]);
    expect(r.leave).toEqual([]);
    expect(r.enter).toEqual([]);
    r = diffView(map, "me", at(0, 0), known, [e("near", AOI_LEAVE.x + 1)]);
    expect(r.leave).toEqual(["near"]);
    r = diffView(map, "me", at(0, 0), known, [e("near", 5)]);
    expect(r.enter).toEqual(["near"]);
  });

  it("forgets entities that no longer exist and always shows the boss", () => {
    const known = new Set<string>(["gone"]);
    const map = { width: SIZE };
    const r = diffView(map, "me", at(0, 0), known, [{ id: "boss", pos: at(140, 0), always: true }]);
    expect(r).toEqual({ enter: ["boss"], leave: ["gone"] });
  });
});
