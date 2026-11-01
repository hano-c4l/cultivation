import { describe, expect, it } from "vitest";
import { parseClientMessage } from "./protocol";

describe("trade messages", () => {
  it("trade_add names a bag item and a quantity of at least 1", () => {
    expect(parseClientMessage('{"t":"trade_add","id":"abc-1","qty":3}')).toEqual({ t: "trade_add", id: "abc-1", qty: 3 });
    expect(parseClientMessage('{"t":"trade_add","id":"abc-1","qty":0}')).toBeNull();
    expect(parseClientMessage('{"t":"trade_add","id":"abc-1","qty":1.5}')).toBeNull();
    expect(parseClientMessage('{"t":"trade_add","id":"bad id","qty":1}')).toBeNull();
    expect(parseClientMessage('{"t":"trade_add","qty":1}')).toBeNull();
  });
});
