import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { TraceEnvelope, TraceEnvelopeSchema } from "../planning/schemas";
import { signAccess } from "./access";
import { POST as planPOST } from "../../app/api/plan/route";
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

  it("vague chip in demo blocks on the party clarification only and does not plan", async () => {
    const req = jsonRequest("http://localhost/api/plan", { mode: "plan", text: "chip", chipId: "vague", demo: true }, { cookie: accessCookieHeader() });
    const res = await planPOST(req);
    const envelopes = await drainEnvelopes(res);
    const types = envelopes.map((e) => e.event.type);
    expect(types).toEqual(["decision", "request_parsed", "decision", "done"]);
    const parsed = envelopes[1]!.event;
    if (parsed.type === "request_parsed") {
      expect(parsed.clarificationsNeeded).toHaveLength(1);
      expect(parsed.clarificationsNeeded[0]!.field).toBe("party");
    }
  });

  it("budget chip (no arrival stated) plans with an explicit arrival assumption", async () => {
    const req = jsonRequest("http://localhost/api/plan", { mode: "plan", text: "chip", chipId: "budget", demo: true }, { cookie: accessCookieHeader() });
    const envelopes = await drainEnvelopes(await planPOST(req));
    const types = envelopes.map((e) => e.event.type);
    expect(types).toContain("assumption_made");
    expect(types).toContain("plan_result");
    const assumption = envelopes.find((e) => e.event.type === "assumption_made")!.event;
    if (assumption.type === "assumption_made") {
      expect(assumption.field).toBe("arrival");
      expect(assumption.assumed).toMatch(/Lakeshore (East|West)/);
      expect(assumption.reason).toContain("No arrival time");
    }
    // assumption_made lands after candidates_summary and before plan_result
    expect(types.indexOf("assumption_made")).toBeGreaterThan(types.indexOf("candidates_summary"));
    expect(types.indexOf("assumption_made")).toBeLessThan(types.indexOf("plan_result"));
  });

  it("family chip emits no assumption events (arrival and food preference are stated)", async () => {
    const req = jsonRequest("http://localhost/api/plan", { mode: "plan", text: "chip", chipId: "family", demo: true }, { cookie: accessCookieHeader() });
    const envelopes = await drainEnvelopes(await planPOST(req));
    expect(envelopes.map((e) => e.event.type)).not.toContain("assumption_made");
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

  const VAGUE_BASE = [
    { type: "dietary", value: { need: "gluten-free", severity: "intolerance" }, priority: "hard", sourceText: "one gluten-free" },
    { type: "arrival", value: { statedClock: "6:18", normalizedClock: "18:18", mode: "train" }, priority: "hard", sourceText: "train at 6:18" },
    { type: "seated_by", value: { milestone: "warmups" }, priority: "high", sourceText: "seated for warmups" },
  ];
  const PARTY_ANSWER = { type: "party", value: { adults: 1, children: 2 }, priority: "hard", sourceText: "Answered inline: 1 adult, 2 children" };

  it("demo answerConstraints merge plans without a chip and without any model call", async () => {
    const req = jsonRequest("http://localhost/api/plan", {
      mode: "plan", text: "refinement", demo: true,
      refinement: {
        baseConstraints: VAGUE_BASE, answerConstraints: [PARTY_ANSWER],
        pendingClarifications: [{ field: "party", question: "How many adults and how many children are going?" }],
      },
    }, { cookie: accessCookieHeader() });
    const envelopes = await drainEnvelopes(await planPOST(req));
    const types = envelopes.map((e) => e.event.type);
    expect(types).toContain("plan_result");
    expect(types[types.length - 1]).toBe("done");
    const parsed = envelopes.find((e) => e.event.type === "request_parsed")!.event;
    if (parsed.type === "request_parsed") {
      expect(parsed.constraints).toHaveLength(4);
      expect(parsed.clarificationsNeeded).toEqual([]);
    }
    const adjusted = envelopes.filter((e) => e.event.type === "constraint_adjusted").map((e) => e.event);
    expect(adjusted.some((a) => a.type === "constraint_adjusted" && a.field === "party" && a.resolved.includes("1 adult"))).toBe(true);
    // food_timing assumption fires: gluten-free forces a stand and no food_preference was stated
    expect(types).toContain("assumption_made");
  });

  it("demo followUpText is refused with scoped copy and no model call", async () => {
    const req = jsonRequest("http://localhost/api/plan", {
      mode: "plan", text: "refinement", demo: true,
      refinement: { baseConstraints: VAGUE_BASE, followUpText: "cheaper food please" },
    }, { cookie: accessCookieHeader() });
    const envelopes = await drainEnvelopes(await planPOST(req));
    const types = envelopes.map((e) => e.event.type);
    expect(types).toEqual(["decision", "decision", "done"]);
    const scoped = envelopes[1]!.event;
    if (scoped.type === "decision") expect(scoped.summary).toContain("quick chips");
  });

  it("refinement with prior produces a diff against the true prior plan", async () => {
    // First: the family demo plan (its request has arrival 18:18 which snaps to 18:15).
    const first = await drainEnvelopes(await planPOST(jsonRequest("http://localhost/api/plan",
      { mode: "plan", text: "chip", chipId: "family", demo: true }, { cookie: accessCookieHeader() })));
    const firstResult = first.find((e) => e.event.type === "plan_result")!.event;
    if (firstResult.type !== "plan_result" || !firstResult.result.plan) throw new Error("no first plan");
    const familyConstraints = (first.find((e) => e.event.type === "request_parsed")!.event as { constraints: unknown[] }).constraints;

    const arrival1842 = { type: "arrival", value: { statedClock: "6:42", normalizedClock: "18:42", mode: "train" }, priority: "hard", sourceText: "actually 6:42" };
    const req = jsonRequest("http://localhost/api/plan", {
      mode: "plan", text: "refinement", demo: true,
      refinement: {
        baseConstraints: familyConstraints, answerConstraints: [arrival1842],
        prior: { planId: firstResult.result.plan.planId, constraints: familyConstraints, disruptions: [] },
      },
    }, { cookie: accessCookieHeader() });
    const envelopes = await drainEnvelopes(await planPOST(req));
    const resultEvent = envelopes.find((e) => e.event.type === "plan_result")!.event;
    if (resultEvent.type === "plan_result") {
      expect(resultEvent.result.priorPlanId).toBe(firstResult.result.plan.planId);
      expect(resultEvent.result.diff).toBeDefined();
      const gone = [...resultEvent.result.diff!.invalidatedStepIds, ...resultEvent.result.diff!.replacedSteps.map((r) => r.oldStepId)];
      expect(gone.some((id) => id.startsWith("transit:"))).toBe(true);
    }
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
