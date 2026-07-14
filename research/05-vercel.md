# Phase 0 Verification: Vercel Platform Constraints (Hobby Plan)

Agent 5, adversarial verification swarm. All evidence fetched 2026-07-13 from vercel.com docs (doc pages carry last_updated stamps of 2026-06 and 2026-07). Every quote below is verbatim from Vercel's own documentation.

---

## Verdict table

| # | PRD claim | Verdict | Evidence (URL + exact quote) |
|---|---|---|---|
| 1 | Fluid compute is the default for new projects | **CONFIRMED** | https://vercel.com/docs/fluid-compute : "As of April 23, 2025, fluid compute is enabled by default for new projects." |
| 2 | Max duration 300s on Hobby (Section 7, 9) | **CONFIRMED** (with clarification: 300s is both the default and the ceiling on Hobby) | https://vercel.com/docs/functions/limitations : "Hobby: 300s default and maximum. Pro and Enterprise: 300s default, 800s maximum, and 1800s extended maximum." Duration table at https://vercel.com/docs/functions/configuring-functions/duration : "Hobby \| 300s (5 minutes) \| 300s (5 minutes) \| -" |
| 3 | **Rate limiting via Vercel WAF rules works on Hobby** (Sections 7, 9, 12, 16) | **CONFIRMED** | https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting Limits table, Hobby column: "Included counting keys: IP, JA4 Digest; Counting algorithm: Fixed window; Counting window: Minimum: 10s, Maximum: 10mins; Number of rules: 1 per project; Included requests: 1,000,000 Allowed requests." |
| 4 | WAF custom rules (deny, challenge, log) available free on Hobby | **CONFIRMED** | https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing : "Vercel Firewall features available on all plans are free to use. This includes DDoS mitigation, IP blocking, and custom rules." Hobby cap: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting : "Hobby projects can have up to 3 total custom firewall rules." |
| 5 | Streamed responses count toward function duration | **CONFIRMED** | https://vercel.com/docs/functions/limitations#max-duration : "This refers to the longest time a function invocation can run before Vercel terminates it. For request handlers, this includes time spent processing the request and sending the response, including streamed responses." |
| 6 | Server-only env vars: encrypted at rest, not exposed client-side unless prefixed | **CONFIRMED** | https://vercel.com/docs/environment-variables : "These values are encrypted at rest and visible to any user that has access to the project. It is safe to use both non-sensitive and sensitive data, such as tokens." https://vercel.com/docs/environment-variables/framework-environment-variables : "Many frontend frameworks require prefixes on environment variable names to make them available to the client, such as `NEXT_PUBLIC_` for Next.js" |
| 7 | "Unlisted deployment" does security work (Section 9) | **CORRECTED** | The Hobby production URL is public and is not auto-noindexed. https://vercel.com/docs/deployments/generated-urls : "This URL is **publicly accessible by default**". https://vercel.com/docs/deployment-protection : "On the Hobby plan, Vercel Authentication with Standard Protection is available. This protects your preview deployments and deployment URLs, but your production domain remains publicly accessible. To protect production domains, you need a Pro or Enterprise plan." Noindex applies to previews only: https://vercel.com/kb/guide/are-vercel-preview-deployment-indexed-by-search-engines : "Vercel Preview Deployments are not indexed by search engines by default because the `X-Robots-Tag` HTTP header is set to `noindex`." |
| 8 | `?demo=1` demo mode plus simple access code in app code | **CONFIRMED** (viable; it is app code, and no platform feature blocks or replaces it on Hobby) | Password Protection cannot substitute on Hobby: https://vercel.com/docs/deployment-protection : "Password Protection: Restricts access to users with the correct password. Available on the Enterprise plan, or as a paid add-on for Pro plans" and "Pro plan customers can access these features for an additional $150 per month". |
| 9 | Managed rulesets (OWASP) on Hobby | **UNVERIFIED** (risk note below; PRD does not depend on them) | https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing prices "OWASP CRS per request size" with an "Included (Pro)" column and no Hobby column. Assume unavailable on Hobby. Not needed for GameLoop. |
| 10 | Behavior when a Hobby project exceeds 1,000,000 rate-limit-allowed requests | **UNVERIFIED** (risk note below) | The docs state the included allotment ("Included requests: 1,000,000 Allowed requests") and that "The pricing is based on the region(s) from which the requests come from", but do not state the Hobby overage behavior on the fetched pages. |

---

## The WAF answer (priority question)

**WAF rate limiting IS available on the Hobby plan. No fallback is required.** The PRD assumption in Sections 7, 12, and 16 ("Rate limiting via Vercel WAF rules, not process memory") stands.

Hobby specifics, all from https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting (last_updated 2026-06-16):

- **1 rate-limit rule per project** ("Number of rules: 1 per project"). Pro gets 40, Enterprise 1000.
- **Fixed window algorithm only** ("Select Fixed Window (all plans) or Token Bucket (Enterprise)").
- **Counting keys: IP and JA4 digest** (User Agent and arbitrary header keys are Enterprise only).
- **Window between 10s and 10 minutes**, defaults 60s window / 100 requests.
- **1,000,000 allowed requests included** on Hobby.
- Actions on limit: "you can leave the **Default (429)** action or choose between **Log**, **Deny** and **Challenge**".
- Separately, Hobby gets **up to 3 total custom firewall rules** (deny/challenge/log/bypass/redirect), and custom rules are free on all plans.

### Design consequence of "1 rule per project" (ADJUSTMENT, not blocker)

`/api/plan` and `/api/relive` must share the single Hobby rate-limit rule. Scope one rule to "path starts with /api", keyed by IP, for example 20 requests per 60s, action Deny (or default 429). The docs' own natural-language example shows exactly this shape: "Rate limit /api to 100 requests per minute per IP" creates a "Rate limit rule on `/api`: 60-second window, 100 request limit, keyed by IP".

Caveat worth knowing: "Rate limit counters are tracked on a per-region basis; traffic matching a given rate limit key in multiple regions can exceed the limit you configure for any single region." Irrelevant at demo scale, worth one line in /how-it-works honesty if quoted.

### Defense-in-depth ordering (since only one WAF rate rule exists)

1. **Vercel WAF rate-limit rule on `/api/*` (free tier, confirmed above).** Trade-off: one shared budget for both routes and per-region counters, so no per-route or per-user granularity.
2. **Aggressive per-request caps inside the route handlers** (already in the PRD: 1,000-char input cap, mode allow-list, 3 to 4 model steps max, 30s hard timeout; the platform adds a 4.5 MB body cap for free). Trade-off: caps cost per request rather than requests per minute, so a determined caller can still loop, but each loop is cheap and bounded.
3. **Upstash Redis limiter in the route handler** (Vercel Marketplace) only if per-user budgets become necessary. Trade-off: a new dependency, added latency, and setup time during a three-evening build; unjustified for an interview demo.

The `@vercel/firewall` SDK (`checkRateLimit`, https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk) exists for in-code checks against dashboard-configured rate limit IDs, but it consumes the same WAF rate-limiting feature; the plain path-scoped rule is simpler and sufficient.

---

## Duration and streaming notes

- **Hobby: default 300s, maximum 300s.** `maxDuration` on Hobby can only lower the limit, not raise it. PRD Section 9 wording "max duration 300s on Hobby (configurable via maxDuration)" is accurate as long as nobody expects to configure it upward. The 800s and 1800s tiers are Pro/Enterprise only. PRD product budgets (12s plan, 30s hard timeout) sit far inside the platform ceiling, so no impact.
- **The clock runs while the stream is open.** "For request handlers, this includes time spent processing the request and sending the response, including streamed responses" (limitations#max-duration). The duration page repeats it: allow "any necessary waiting periods (for example, streamed responses)". Timeout produces "a 504 error code (`FUNCTION_INVOCATION_TIMEOUT`)".
- **Keep-alive:** from the duration page: "For long-running request handlers that keep a client connection open over HTTP/2, Vercel sends connection-level HTTP/2 `PING` frames while the response is idle. HTTP/1.1 does not have an equivalent protocol frame, so HTTP/1.1 clients and intermediate network layers may still close idle connections. For those cases, stream progress or heartbeat data while work is running." The Decision Log's TraceEvent stream is a natural heartbeat; with the first event targeted under 750ms and steady tool events after, idle-connection closure is a non-issue.
- **Edge runtime is different and should not be used here:** "Vercel Functions using the Edge runtime must begin sending a response within 25 seconds ... and can continue streaming data for up to 300 seconds." The PRD's Node.js + fluid default avoids this constraint entirely.
- **Payload cap:** "The maximum payload size for the request body or the response body of a Vercel Function is **4.5 MB**" (413 `FUNCTION_PAYLOAD_TOO_LARGE`). This is the platform floor under the PRD's own body-size cap; reduced fixtures (< 4,000 tokens asserted) are nowhere near it.
- **Cost while streaming:** "Active CPU billing applies while your code is executing, and pauses while your function is waiting on I/O" (duration page), and "The Hobby plan offers functions for free, within limits" (limitations page). Waiting on Anthropic stream chunks does not burn active CPU.

---

## Environment variables and demo posture

- **ANTHROPIC_API_KEY as a server-only var: fully supported.** Values are "encrypted at rest" (environment-variables page). Only prefixed variables reach the browser: "Frameworks typically use a prefix in order to expose environment variables to the browser" and "such as `NEXT_PUBLIC_` for Next.js" (framework-environment-variables page). An unprefixed `ANTHROPIC_API_KEY` is available only to the build and to function execution.
- **Optional hardening, zero cost:** mark the key as a Sensitive environment variable: "Sensitive environment variables are environment variables whose values are non-readable once created" and build-log redaction applies (sensitive-environment-variables page). Recommended for a repo that will be shown to an interviewer.

### "Unlisted" posture: CORRECTED, with a cheap fix

What the docs actually give on Hobby:

1. Generated deployment URLs are "**publicly accessible by default**" (generated-urls page).
2. Hobby Deployment Protection covers previews only: "your production domain remains publicly accessible. To protect production domains, you need a Pro or Enterprise plan" (deployment-protection page). Password Protection is "Available on the Enterprise plan, or as a paid add-on for Pro plans" at $150/month. Trusted IPs is Enterprise only.
3. Automatic `X-Robots-Tag: noindex` applies to **preview deployments only**: "Vercel Preview Deployments are not indexed by search engines by default because the `X-Robots-Tag` HTTP header is set to `noindex`." A production `.vercel.app` URL gets no automatic noindex.

So "unlisted" on the Hobby production URL means only: a random-looking hostname that nobody links to. It is obscurity, not protection.

**ADJUSTMENT (small, do it):**
- Ship the app's own noindex: `robots: { index: false, follow: false }` in the Next.js root metadata (or a `X-Robots-Tag: noindex` header via `next.config` headers). One line, closes the gap Vercel leaves open on production.
- Keep the PRD's app-level access code as the real gate for anything that spends LLM budget; `?demo=1` seeded mode plus access code is pure app code and nothing on the platform blocks it.
- Option worth knowing: demoing from a **preview deployment URL** gets automatic noindex for free, and on Hobby it can additionally sit behind Vercel Authentication (visitors must be logged-in Vercel users with project access). Fine when presenting from your own laptop; wrong choice if the URL will be sent to the interviewer afterward, in which case production URL + access code is correct.

---

## Risk notes for the two UNVERIFIED items

- **Managed rulesets on Hobby (verdict 9):** the pricing table shows an "Included (Pro)" column for the OWASP Core Ruleset with no Hobby figure. Treat OWASP CRS as unavailable or paid outside Hobby. GameLoop does not need it: DDoS mitigation is automatic on all plans, and the 3 free custom rules plus 1 rate-limit rule cover the PRD's stated needs.
- **Rate-limit overage past 1,000,000 allowed requests on Hobby (verdict 10):** the docs state the included allotment but not what happens after it on Hobby (rules disabled versus project pause). A three-day interview demo cannot plausibly approach 1M rate-limit-evaluated requests, so this is a documentation gap, not a project risk.

## Flags summary

- **No BLOCKERs.**
- **ADJUSTMENT 1:** Hobby allows exactly one WAF rate-limit rule per project; scope it to `path starts with /api` so it covers both `/api/plan` and `/api/relive`. Budget the limits accordingly (per-region fixed window, IP-keyed).
- **ADJUSTMENT 2:** "Unlisted" needs one line of help: production `.vercel.app` URLs are public and not auto-noindexed on Hobby, and no Hobby Deployment Protection covers production. Add app-served noindex metadata and keep the app-level access code as the actual gate.
- **Clarification (no PRD change needed):** on Hobby, 300s is the maximum as well as the default; `maxDuration` cannot extend it. The PRD already treats 300s as a platform ceiling, not a target.
