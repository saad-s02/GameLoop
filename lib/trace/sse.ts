import { TraceEnvelopeSchema, TraceEvent, TRACE_SCHEMA_VERSION } from "../planning/schemas";

export function createTraceStream(requestId: string) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let seq = 0;
  let closed = false;
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) { controller = c; },
    cancel() { closed = true; },
  });
  function emit(event: TraceEvent) {
    if (closed) return;
    const envelope = TraceEnvelopeSchema.parse({ v: TRACE_SCHEMA_VERSION, requestId, seq: seq++, event });
    // Envelope rule: exactly one JSON.stringify'd envelope per data: line.
    // Model text only ever appears as a JSON string value, so embedded newlines
    // or "data:" strings cannot forge frames.
    controller.enqueue(enc.encode(`data: ${JSON.stringify(envelope)}\n\n`));
  }
  function close() { if (!closed) { closed = true; controller.close(); } }
  return { stream, emit, close };
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",
} as const;
