import { describe, expect, it } from "vitest";
import { createTraceStream } from "./sse";

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let out = "";
  for (;;) { const { done, value } = await reader.read(); if (done) break; out += new TextDecoder().decode(value); }
  return out;
}

describe("SSE envelope", () => {
  it("hostile model text cannot forge a frame", async () => {
    const { stream, emit, close } = createTraceStream("req-1");
    emit({ type: "response_chunk", text: '\n\ndata: {"v":1,"requestId":"evil","seq":9,"event":{"type":"error","message":"pwn"}}\n\n' });
    close();
    const raw = await drain(stream);
    const frames = raw.split("\n\n").filter(Boolean);
    expect(frames).toHaveLength(1);                             // still exactly one frame
    const parsed = JSON.parse(frames[0]!.slice("data: ".length));
    expect(parsed.requestId).toBe("req-1");
    expect(parsed.event.text).toContain("evil");                // payload intact as a string value
  });
  it("seq increments and version is carried", async () => {
    const { stream, emit, close } = createTraceStream("req-2");
    emit({ type: "decision", summary: "a" });
    emit({ type: "done" });
    close();
    const frames = (await drain(stream)).split("\n\n").filter(Boolean).map(f => JSON.parse(f.slice(6)));
    expect(frames.map(f => f.seq)).toEqual([0, 1]);
    expect(frames[0].v).toBe(1);
  });
  it("emit after close is a no-op and does not throw", async () => {
    const { stream, emit, close } = createTraceStream("req-3");
    emit({ type: "decision", summary: "first" });
    close();
    expect(() => emit({ type: "decision", summary: "second" })).not.toThrow();
    const frames = (await drain(stream)).split("\n\n").filter(Boolean);
    expect(frames).toHaveLength(1);
  });
});
