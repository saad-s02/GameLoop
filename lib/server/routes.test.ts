import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GameMemorySchema, TraceEnvelope, TraceEnvelopeSchema } from "../planning/schemas";
import { signAccess } from "./access";
import { POST as planPOST } from "../../app/api/plan/route";
import { POST as relivePOST } from "../../app/api/relive/route";
import { POST as warmupPOST } from "../../app/api/warmup/route";
import { POST as accessPOST } from "../../app/api/access/route";

const ORIGINAL_ACCESS_CODE = process.env.ACCESS_CODE;
const ORIGINAL_ACCESS_COOKIE_SECRET = process.env.ACCESS_COOKIE_SECRET;

beforeEach(() => {
  process.env.ACCESS_CODE = "test-code";
  process.env.ACCESS_COOKIE_SECRET = "test-secret";
});

afterEach(() => {
  if (ORIGINAL_ACCESS_CODE === undefined) delete process.env.ACCESS_CODE;
  else process.env.ACCESS_CODE = ORIGINAL_ACCESS_CODE;
  if (ORIGINAL_ACCESS_COOKIE_SECRET === undefined) delete process.env.ACCESS_COOKIE_SECRET;
  else process.env.ACCESS_COOKIE_SECRET = ORIGINAL_ACCESS_COOKIE_SECRET;
});

function accessCookieHeader(): string {
  return `gl_access=${signAccess(process.env.ACCESS_CODE!, process.env.ACCESS_COOKIE_SECRET!)}`;
}

function jsonRequest(url: string, body: unknown, opts: { cookie?: string; rawBody?: string } = {}): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.cookie) headers["Cookie"] = opts.cookie;
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: opts.rawBody ?? JSON.stringify(body),
  });
}

async function drainEnvelopes(res: Response): Promise<TraceEnvelope[]> {
  expect(res.body).not.toBeNull();
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
  }
  const frames = buf.split("\n\n").filter(Boolean);
  return frames.map((f) => TraceEnvelopeSchema.parse(JSON.parse(f.slice("data: ".length))));
}

describe("POST /api/plan", () => {
  it("demo family chip: first-frame decision then request_parsed strictly before plan_result, 4x data_received, constraint_adjusted present, then candidates_summary, decision, plan_result, response_chunk, done", async () => {
    const req = jsonRequest(
      "http://localhost/api/plan",
      { mode: "plan", text: "chip", chipId: "family", demo: true },
      { cookie: accessCookieHeader() },
    );
    const res = await planPOST(req);
    expect(res.status).toBe(200);

    const envelopes = await drainEnvelopes(res);
    const types: string[] = envelopes.map((e) => e.event.type);

    // The very first frame is the pre-extraction "Reading your request." decision
    // (first-frame latency fix), immediately followed by request_parsed.
    expect(types[0]).toBe("decision");
    expect(types[1]).toBe("request_parsed");
    expect(types.filter((t) => t === "decision")).toHaveLength(2);
    expect(types.filter((t) => t === "data_received")).toHaveLength(4);
    expect(types.filter((t) => t === "data_requested")).toHaveLength(4);
    expect(types).toContain("constraint_adjusted");
    expect(types).toContain("candidates_summary");
    expect(types).toContain("plan_result");
    expect(types).toContain("response_chunk");
    expect(types[types.length - 1]).toBe("done");

    const idx = (t: string) => types.indexOf(t);
    const lastIdx = (t: string) => types.lastIndexOf(t);
    const dataReceivedIdxs = types.map((t, i) => (t === "data_received" ? i : -1)).filter((i) => i >= 0);

    // Constraint contract strictly before the plan.
    expect(idx("request_parsed")).toBeLessThan(idx("plan_result"));
    // Adapter data calls happen after the constraint contract and before the plan result.
    for (const dIdx of dataReceivedIdxs) {
      expect(dIdx).toBeGreaterThan(idx("request_parsed"));
      expect(dIdx).toBeLessThan(idx("plan_result"));
    }
    expect(idx("constraint_adjusted")).toBeGreaterThan(idx("request_parsed"));
    expect(idx("constraint_adjusted")).toBeLessThan(idx("candidates_summary"));
    // The second (final) decision frame -- the decisionSummary card -- comes after
    // candidates_summary and before plan_result; the first decision frame (index 0)
    // is the pre-extraction one and is intentionally excluded from this ordering.
    expect(idx("candidates_summary")).toBeLessThan(lastIdx("decision"));
    expect(lastIdx("decision")).toBeLessThan(idx("plan_result"));
    expect(idx("response_chunk")).toBeGreaterThan(idx("plan_result"));
    expect(idx("response_chunk")).toBeLessThan(types.length - 1); // done is last

    // Envelope integrity: strictly increasing seq, single schema version, single requestId.
    expect(envelopes.map((e) => e.seq)).toEqual(envelopes.map((_, i) => i));
    expect(new Set(envelopes.map((e) => e.v))).toEqual(new Set([1]));
    expect(new Set(envelopes.map((e) => e.requestId)).size).toBe(1);

    const planResultEnvelope = envelopes.find((e) => e.event.type === "plan_result")!;
    if (planResultEnvelope.event.type === "plan_result") {
      expect(planResultEnvelope.event.result.feasible).toBe(true);
    }
  });

  it("returns 401 without a valid access cookie", async () => {
    const req = jsonRequest("http://localhost/api/plan", { mode: "plan", text: "chip", chipId: "family", demo: true });
    const res = await planPOST(req);
    expect(res.status).toBe(401);
  });

  it("demo mode without a chip refuses with a scoped decision and never reaches extraction (zero-LLM guarantee)", async () => {
    const req = jsonRequest(
      "http://localhost/api/plan",
      { mode: "plan", text: "free text in demo mode", demo: true },
      { cookie: accessCookieHeader() },
    );
    const res = await planPOST(req);
    expect(res.status).toBe(200);
    const envelopes = await drainEnvelopes(res);
    // First frame is the pre-extraction "Reading your request." decision (first-frame
    // latency fix); the second is the scoped "Demo mode..." refusal decision.
    expect(envelopes.map((e) => e.event.type)).toEqual(["decision", "decision", "done"]);
    const firstDecision = envelopes[0]!.event;
    if (firstDecision.type === "decision") expect(firstDecision.summary).toBe("Reading your request.");
    const scopedDecision = envelopes[1]!.event;
    if (scopedDecision.type === "decision") expect(scopedDecision.summary).toContain("Demo mode");
  });

  it("returns 400 for an unrecognized mode", async () => {
    const req = jsonRequest("http://localhost/api/plan", { mode: "chat", text: "hi" }, { cookie: accessCookieHeader() });
    const res = await planPOST(req);
    expect(res.status).toBe(400);
  });

  it("returns 413 for an oversized body", async () => {
    const rawBody = JSON.stringify({ mode: "plan", text: "hi", padding: "x".repeat(11 * 1024) });
    expect(rawBody.length).toBeGreaterThan(10_000);
    const req = jsonRequest("http://localhost/api/plan", null, { cookie: accessCookieHeader(), rawBody });
    const res = await planPOST(req);
    expect(res.status).toBe(413);
  });
});

describe("POST /api/relive", () => {
  it("demo mode: moment_package, decision, recap_result, done", async () => {
    const req = jsonRequest(
      "http://localhost/api/relive",
      { mode: "relive", gameId: "2025030413", live: false, demo: true },
      { cookie: accessCookieHeader() },
    );
    const res = await relivePOST(req);
    expect(res.status).toBe(200);

    const envelopes = await drainEnvelopes(res);
    const types = envelopes.map((e) => e.event.type);
    expect(types).toEqual(["moment_package", "decision", "recap_result", "done"]);

    const recapEnvelope = envelopes.find((e) => e.event.type === "recap_result")!;
    if (recapEnvelope.event.type === "recap_result") {
      const memory = GameMemorySchema.parse(recapEnvelope.event.memory);
      expect(memory.scoreLine.length).toBeGreaterThan(0);
      expect(memory.yourNight).toBeUndefined(); // no sessionContext supplied
    }
  });

  it("drops an invalid sessionContext with a fallback_used event but still completes", async () => {
    const req = jsonRequest(
      "http://localhost/api/relive",
      { mode: "relive", gameId: "2025030413", live: false, demo: true, sessionContext: { junk: true } },
      { cookie: accessCookieHeader() },
    );
    const res = await relivePOST(req);
    const envelopes = await drainEnvelopes(res);
    const types = envelopes.map((e) => e.event.type);
    expect(types[0]).toBe("fallback_used");
    expect(types).toContain("moment_package");
    expect(types[types.length - 1]).toBe("done");
  });

  it("returns 401 without a valid access cookie", async () => {
    const req = jsonRequest("http://localhost/api/relive", { mode: "relive", gameId: "2025030413", live: false, demo: true });
    const res = await relivePOST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid body", async () => {
    const req = jsonRequest("http://localhost/api/relive", { mode: "plan", gameId: "2025030413" }, { cookie: accessCookieHeader() });
    const res = await relivePOST(req);
    expect(res.status).toBe(400);
  });

  it("returns 413 for an oversized body", async () => {
    const rawBody = JSON.stringify({ mode: "relive", gameId: "2025030413", padding: "x".repeat(11 * 1024) });
    const req = jsonRequest("http://localhost/api/relive", null, { cookie: accessCookieHeader(), rawBody });
    const res = await relivePOST(req);
    expect(res.status).toBe(413);
  });
});

describe("POST /api/warmup", () => {
  it("returns 401 without a valid access cookie (no model call is ever reached)", async () => {
    const req = jsonRequest("http://localhost/api/warmup", {});
    const res = await warmupPOST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});

describe("POST /api/access", () => {
  it("sets the gl_access cookie for the correct code", async () => {
    const req = jsonRequest("http://localhost/api/access", { code: process.env.ACCESS_CODE });
    const res = await accessPOST(req);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("gl_access=");
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("returns 401 for the wrong code", async () => {
    const req = jsonRequest("http://localhost/api/access", { code: "wrong-code" });
    const res = await accessPOST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for a malformed body", async () => {
    const req = jsonRequest("http://localhost/api/access", { code: "" });
    const res = await accessPOST(req);
    expect(res.status).toBe(400);
  });
});
