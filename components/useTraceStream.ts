"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TraceEnvelope, TraceEnvelopeSchema } from "@/lib/planning/schemas";

export type TraceStreamStatus = "idle" | "streaming" | "stalled" | "done" | "error";

const STALL_MS = 6000;

/**
 * POSTs `body` to `url` and reads a newline-delimited SSE-style response
 * (`data: <json>\n\n` frames, each JSON line a TraceEnvelope). Every frame
 * resets a 6-second stall timer; if no frame arrives within that window the
 * status flips to "stalled" without tearing down the connection, and the
 * caller can invoke `retry()` to abort and re-post the same request.
 *
 * A new `url`/`body` pair (by reference or JSON value) starts a fresh
 * request, aborting any in-flight one. `url === null` means "do not fetch".
 */
export function useTraceStream(url: string | null, body: unknown | null) {
  const [events, setEvents] = useState<TraceEnvelope[]>([]);
  const [streamText, setStreamText] = useState("");
  const [status, setStatus] = useState<TraceStreamStatus>("idle");
  const [httpStatus, setHttpStatus] = useState<number | undefined>(undefined);

  const abortRef = useRef<AbortController | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestRef = useRef<{ url: string; body: unknown } | null>(null);
  const runIdRef = useRef(0);

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current !== null) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const armStallTimer = useCallback((thisRun: number) => {
    clearStallTimer();
    stallTimerRef.current = setTimeout(() => {
      if (runIdRef.current === thisRun) setStatus("stalled");
    }, STALL_MS);
  }, [clearStallTimer]);

  const run = useCallback((targetUrl: string, targetBody: unknown) => {
    // Supersede any in-flight request.
    abortRef.current?.abort();
    clearStallTimer();

    const controller = new AbortController();
    abortRef.current = controller;
    lastRequestRef.current = { url: targetUrl, body: targetBody };
    const thisRun = ++runIdRef.current;

    setEvents([]);
    setStreamText("");
    setHttpStatus(undefined);
    setStatus("streaming");
    armStallTimer(thisRun);

    (async () => {
      try {
        const res = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(targetBody),
          signal: controller.signal,
        });
        if (runIdRef.current !== thisRun) return;
        setHttpStatus(res.status);

        if (!res.ok || !res.body) {
          clearStallTimer();
          if (runIdRef.current === thisRun) setStatus("error");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { value, done } = await reader.read();
          if (runIdRef.current !== thisRun) return;
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const dataLines = frame
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim());
            if (dataLines.length === 0) continue;
            const payload = dataLines.join("\n");
            if (!payload) continue;

            let parsedJson: unknown;
            try {
              parsedJson = JSON.parse(payload);
            } catch {
              continue; // malformed frame, skip rather than crash the stream
            }
            const parsed = TraceEnvelopeSchema.safeParse(parsedJson);
            if (!parsed.success) continue;

            armStallTimer(thisRun);
            const envelope = parsed.data;
            const ev = envelope.event;
            setEvents((prev) => [...prev, envelope]);
            if (ev.type === "response_chunk") {
              const chunkText = ev.text;
              setStreamText((prev) => prev + chunkText);
            } else if (ev.type === "error") {
              clearStallTimer();
              setStatus("error");
            } else if (ev.type === "done") {
              clearStallTimer();
              setStatus("done");
            }
          }
        }
        if (runIdRef.current === thisRun) {
          clearStallTimer();
          setStatus((prevStatus) => (prevStatus === "error" ? prevStatus : "done"));
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return; // expected on unmount/retry
        if (runIdRef.current === thisRun) {
          clearStallTimer();
          setStatus("error");
        }
      }
    })();
  }, [armStallTimer, clearStallTimer]);

  const retry = useCallback(() => {
    const last = lastRequestRef.current;
    if (last) run(last.url, last.body);
  }, [run]);

  useEffect(() => {
    if (url === null || body === null || body === undefined) {
      setStatus("idle");
      return;
    }
    run(url, body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, JSON.stringify(body)]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearStallTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { events, streamText, status, retry, httpStatus };
}
