import { z } from "zod";

export const TRACE_SCHEMA_VERSION = 1 as const;
export const SESSION_SCHEMA_VERSION = 1 as const;
export const INPUT_CHAR_CAP = 1000;

// ---------- provenance ----------
export const SourceClassSchema = z.enum(["live", "snapshot", "simulated"]);
export type SourceClass = z.infer<typeof SourceClassSchema>;

export const ClockStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");

// ---------- constraints (extraction contract) ----------
export const PriorityTierSchema = z.enum(["hard", "high", "medium", "low"]);
export type PriorityTier = z.infer<typeof PriorityTierSchema>;

export const DietaryNeedSchema = z.enum(["gluten-free", "vegetarian", "vegan", "nut-free", "dairy-free", "halal"]);
export type DietaryNeed = z.infer<typeof DietaryNeedSchema>;
export const AccessibilityNeedSchema = z.enum(["step-free", "elevator", "accessible-seating"]);

const constraintBase = { priority: PriorityTierSchema, sourceText: z.string().min(1) };

export const ArrivalConstraintSchema = z.object({
  type: z.literal("arrival"),
  value: z.object({
    statedClock: z.string().min(1), // the fan's words, e.g. "6:18"
    normalizedClock: ClockStringSchema, // 24h reading, e.g. "18:18"
    mode: z.enum(["train", "drive", "walk", "other"]),
  }),
  ...constraintBase,
});
export const SeatedByConstraintSchema = z.object({
  type: z.literal("seated_by"),
  value: z.object({ milestone: z.enum(["doors", "warmups", "puck_drop"]) }),
  ...constraintBase,
});
export const DietaryConstraintSchema = z.object({
  type: z.literal("dietary"),
  value: z.object({
    need: DietaryNeedSchema,
    severity: z.enum(["preference", "intolerance", "allergy"]),
  }),
  ...constraintBase,
});
export const BudgetConstraintSchema = z.object({
  type: z.literal("budget"),
  value: z.object({ maxTotalCad: z.number().int().positive() }),
  ...constraintBase,
});
export const AccessibilityConstraintSchema = z.object({
  type: z.literal("accessibility"),
  value: z.object({ need: AccessibilityNeedSchema }),
  ...constraintBase,
});
export const PartyConstraintSchema = z.object({
  type: z.literal("party"),
  value: z.object({ adults: z.number().int().min(0).max(20), children: z.number().int().min(0).max(20) }),
  ...constraintBase,
});
export const NoiseConstraintSchema = z.object({
  type: z.literal("noise"),
  value: z.object({ preference: z.enum(["quieter-preferred", "no-preference"]) }),
  ...constraintBase,
});
export const FoodPreferenceConstraintSchema = z.object({
  type: z.literal("food_preference"),
  value: z.object({ preference: z.enum(["many-choices", "specific-item", "quick-service"]), detail: z.string().optional() }),
  ...constraintBase,
});

export const ConstraintSchema = z.discriminatedUnion("type", [
  ArrivalConstraintSchema,
  SeatedByConstraintSchema,
  DietaryConstraintSchema,
  BudgetConstraintSchema,
  AccessibilityConstraintSchema,
  PartyConstraintSchema,
  NoiseConstraintSchema,
  FoodPreferenceConstraintSchema,
]);
export type Constraint = z.infer<typeof ConstraintSchema>;

/** Extraction output. Unstated values are never invented: they surface as clarificationsNeeded. */
export const PlanRequestSchema = z.object({
  constraints: z.array(ConstraintSchema).max(12),
  clarificationsNeeded: z
    .array(
      z.object({
        field: z.enum(["party", "arrival", "budget", "dietary"]),
        question: z.string(),
      }),
    )
    .default([]),
  offTopic: z.boolean().default(false),
});
export type PlanRequest = z.infer<typeof PlanRequestSchema>;

// ---------- transit (SNAPSHOT, GTFS-derived) ----------
export const TransitOptionSchema = z.object({
  routeId: z.string(),
  origin: z.string(),
  scheduledDeparture: z.string(), // "HH:MM:SS" as in the GTFS snapshot, display artifact
  scheduledArrival: z.string(),
  walkingMinutes: z.number(), // placeholder in snapshot; venue graph owns walking
  reliability: z.enum(["scheduled-only", "simulated-delay"]),
  source: z.literal("gtfs-snapshot"),
});
export type TransitOption = z.infer<typeof TransitOptionSchema>;

// ---------- venue (SIMULATED) ----------
export const WaitBandSchema = z.object({
  fromClock: ClockStringSchema,
  toClock: ClockStringSchema,
  waitMinutes: z.number().min(0),
});
export type WaitBand = z.infer<typeof WaitBandSchema>;
export const WalkEdgeSchema = z.object({ from: z.string(), to: z.string(), minutes: z.number().positive() });
export const GateSchema = z.object({
  id: z.string(),
  name: z.string(),
  accessible: z.boolean(),
  crowdLevel: z.enum(["high", "medium", "low"]),
  waitProfile: z.array(WaitBandSchema).min(1),
  source: z.literal("simulated"),
});
export const MenuItemSchema = z.object({
  name: z.string(),
  priceCad: z.number().positive(),
  dietaryFlags: z.array(DietaryNeedSchema),
});
export const ConcessionStandSchema = z.object({
  id: z.string(),
  name: z.string(),
  menu: z.array(MenuItemSchema).min(1),
  accessible: z.boolean(),
  waitProfile: z.array(WaitBandSchema).min(1),
  source: z.literal("simulated"),
});
export const ViewZoneSchema = z.enum(["centre-ice", "attack-end", "defend-end", "upper-bowl-centre", "upper-bowl-corner"]);
export type ViewZone = z.infer<typeof ViewZoneSchema>;
export const VenueSectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  viewZone: ViewZoneSchema,
  accessible: z.boolean(),
  nearestGateId: z.string(),
  source: z.literal("simulated"),
});
export const VenueSchema = z.object({
  venueId: z.literal("harbourview-arena"),
  name: z.literal("Harbourview Arena"),
  gates: z.array(GateSchema).min(1),
  stands: z.array(ConcessionStandSchema).min(1),
  sections: z.array(VenueSectionSchema).min(1),
  walkingGraph: z.array(WalkEdgeSchema).min(1),
  source: z.literal("simulated"),
});
export type Venue = z.infer<typeof VenueSchema>;

// ---------- game (SNAPSHOT or LIVE) ----------
export const StrengthSchema = z.enum(["EV", "PP", "SH", "EN"]);
export const NormalizedPlaySchema = z.object({
  eventId: z.number().int(),
  sortOrder: z.number().int(),
  type: z.enum(["goal", "shot", "penalty", "period-start", "period-end", "shootout-attempt"]),
  period: z.number().int().min(1),
  periodType: z.enum(["REG", "OT", "SO"]),
  periodLabel: z.string(), // "1st" "2nd" "3rd" "OT" "2OT" ...
  clock: z.string(), // timeInPeriod "MM:SS", display artifact
  elapsedGameSeconds: z.number().int().min(0),
  remainingPeriodSeconds: z.number().int().min(0),
  teamId: z.number().int().optional(),
  teamAbbrev: z.string().optional(),
  scorerId: z.number().int().optional(),
  scorerName: z.string().optional(),
  assistNames: z.array(z.string()).optional(),
  homeScore: z.number().int().min(0), // running score, propagated across non-goal plays
  awayScore: z.number().int().min(0),
  strength: StrengthSchema.optional(), // derived from situationCode + eventOwnerTeamId
  extraAttacker: z.boolean().optional(), // scoring team's own goalie pulled
  valid: z.boolean(), // true on all real snapshot plays; synthetic fixtures may inject false
});
export type NormalizedPlay = z.infer<typeof NormalizedPlaySchema>;

export const GoalieLineSchema = z.object({
  name: z.string(),
  teamAbbrev: z.string(),
  saves: z.number().int().min(0),
  shotsAgainst: z.number().int().min(0),
  goalsAgainst: z.number().int().min(0),
  toi: z.string(),
  starter: z.boolean(),
});
export type GoalieLine = z.infer<typeof GoalieLineSchema>;
export const TeamRefSchema = z.object({
  id: z.number().int(),
  abbrev: z.string(),
  placeName: z.string(),
  commonName: z.string(),
});

export const ShowcaseGameSchema = z.object({
  gameId: z.string(),
  source: z.enum(["snapshot", "live"]),
  sourceMeta: z.object({
    endpoint: z.string(),
    fetchedAt: z.string(),
    rawBytes: z.object({ playByPlay: z.number().int(), boxscore: z.number().int() }),
  }),
  eventDate: z.string(), // real date; Relive only, never rendered in Plan mode
  homeTeam: TeamRefSchema,
  awayTeam: TeamRefSchema,
  finalScore: z.object({ home: z.number().int(), away: z.number().int() }),
  gameOutcome: z.object({ lastPeriodType: z.enum(["REG", "OT", "SO"]), otPeriods: z.number().int().optional() }),
  regPeriods: z.number().int(),
  venueId: z.literal("harbourview-arena"), // fiction owns venue identity; real venue scrubbed
  doorsOpenAt: ClockStringSchema, // SIMULATED event ops, the fictional "tonight"
  warmupStartAt: ClockStringSchema,
  puckDropAt: ClockStringSchema,
  eventOpsSource: z.literal("simulated"),
  plays: z.array(NormalizedPlaySchema),
  goalies: z.array(GoalieLineSchema),
});
export type ShowcaseGame = z.infer<typeof ShowcaseGameSchema>;

// ---------- moments ----------
export const MomentTypeSchema = z.enum(["ot-winner", "comeback-arc", "scoring-run", "goalie-performance", "goal"]);
export const MemberPlayRefSchema = z.object({
  eventId: z.number().int(),
  periodLabel: z.string(),
  clock: z.string(),
  scorerName: z.string().optional(),
  scoreAfter: z.string(), // "CAR 4, VGK 4"
});
export const MomentSchema = z.object({
  id: z.string(),
  type: MomentTypeSchema,
  rank: z.number().int().min(1),
  score: z.number(),
  headline: z.string(), // deterministic, code-built
  teamAbbrev: z.string().optional(),
  outcome: z.enum(["won", "led", "tied", "fell-short"]).optional(), // comeback arcs only
  memberPlays: z.array(MemberPlayRefSchema), // empty for goalie-performance moments (boxscore-derived, no play events)
  childRuns: z.array(z.object({ spanSeconds: z.number().int(), memberEventIds: z.array(z.number().int()) })).optional(),
  assistNames: z.array(z.string()).optional(), // first field dropped by the trim
});
export type Moment = z.infer<typeof MomentSchema>;
export const MomentPackageSchema = z.object({
  gameId: z.string(),
  scoreLine: z.string(), // "VGK 5, CAR 4 (2OT)", code-built, recap must echo verbatim
  gameOutcome: z.object({ lastPeriodType: z.enum(["REG", "OT", "SO"]), otPeriods: z.number().int().optional() }),
  moments: z.array(MomentSchema).min(1).max(3),
});
export type MomentPackage = z.infer<typeof MomentPackageSchema>;

// ---------- session memory ----------
export const SessionContextSchema = z.object({
  schemaVersion: z.literal(SESSION_SCHEMA_VERSION),
  plannedGameId: z.string(),
  venueId: z.literal("harbourview-arena"),
  party: z.object({ adults: z.number().int().min(0), children: z.number().int().min(0) }),
  dietaryRequirements: z.array(z.object({ value: DietaryNeedSchema, source: z.literal("explicit-user-input") })),
  seatSection: z.string().optional(),
  viewZone: ViewZoneSchema.optional(),
  arrivalChoice: z
    .object({ mode: z.enum(["train", "drive", "walk", "other"]), scheduledArrival: z.string() })
    .optional(),
  selectedPlanId: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(), // 7 days
});
export type SessionContext = z.infer<typeof SessionContextSchema>;

// ---------- itinerary / plan result ----------
export const ItineraryStepSchema = z.object({
  // stable across replans: "transit:<routeId>:<arrival>", "gate:<gateId>", "food:<standId>", "seat:<sectionId>", "milestone:<name>"
  stepId: z.string(),
  kind: z.enum(["transit", "walk", "gate", "food", "seat", "milestone"]),
  startMinutes: z.number(), // normalized minutes
  clock: ClockStringSchema, // display, formatted by normalizedMinutesToClock or copied from source
  title: z.string(),
  detail: z.string().optional(),
  source: SourceClassSchema,
  walkFromNode: z.string().optional(), // when kind walk: rendered walkingMinutes computed from venue graph
  walkToNode: z.string().optional(),
});
export type ItineraryStep = z.infer<typeof ItineraryStepSchema>;
export const ConstraintOutcomeSchema = z.object({
  constraint: ConstraintSchema,
  status: z.enum(["satisfied", "traded", "violated"]),
  note: z.string().optional(),
});
export type ConstraintOutcome = z.infer<typeof ConstraintOutcomeSchema>;
export const ItineraryPlanSchema = z.object({
  planId: z.string(),
  candidateId: z.string(), // "gate|stands|transit|strategy" composite, lexicographic tie-break key
  gateId: z.string(),
  standIds: z.array(z.string()).max(2),
  transitRouteId: z.string().optional(),
  transitArrival: z.string().optional(),
  arrivalStrategy: z.enum(["pickup-en-route", "pickup-after-seating"]),
  seatSection: z.string(),
  viewZone: ViewZoneSchema,
  seatedAtMinutes: z.number(),
  walkingMinutes: z.number(),
  waitMinutes: z.number(),
  estimatedCostCad: z.number(),
  score: z.number(),
  steps: z.array(ItineraryStepSchema).min(1),
  constraintOutcomes: z.array(ConstraintOutcomeSchema),
});
export type ItineraryPlan = z.infer<typeof ItineraryPlanSchema>;

export const ConstraintAdjustmentSchema = z.object({
  field: z.string(),
  requested: z.string(),
  resolved: z.string(),
  reason: z.string(),
});
export type ConstraintAdjustment = z.infer<typeof ConstraintAdjustmentSchema>;
export const PlanDiffSchema = z.object({
  preservedStepIds: z.array(z.string()),
  invalidatedStepIds: z.array(z.string()),
  replacedSteps: z.array(z.object({ oldStepId: z.string(), newStepId: z.string() })),
});
export type PlanDiff = z.infer<typeof PlanDiffSchema>;
export const PlanResultSchema = z.object({
  feasible: z.boolean(),
  plan: ItineraryPlanSchema.optional(), // present when feasible
  runnerUp: ItineraryPlanSchema.optional(),
  violations: z.array(z.string()).default([]), // when infeasible: explicit list
  bestAlternative: ItineraryPlanSchema.optional(), // when infeasible
  adjustments: z.array(ConstraintAdjustmentSchema).default([]),
  candidateStats: z.object({ evaluated: z.number().int(), feasible: z.number().int() }),
  priorPlanId: z.string().optional(),
  diff: PlanDiffSchema.optional(),
});
export type PlanResult = z.infer<typeof PlanResultSchema>;

// ---------- disruptions ----------
export const DisruptionIdSchema = z.enum([
  "train-plus-18",
  "gate1-wait-22",
  "gf-stand-closed",
  "milestone-puck-drop",
  "add-accessibility",
]);
export type DisruptionId = z.infer<typeof DisruptionIdSchema>;

// ---------- trace stream ----------
export const TraceEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("request_parsed"),
    constraints: z.array(ConstraintSchema),
    clarificationsNeeded: z.array(z.object({ field: z.string(), question: z.string() })),
  }),
  z.object({
    type: z.literal("constraint_adjusted"),
    field: z.string(),
    requested: z.string(),
    resolved: z.string(),
    reason: z.string(),
  }),
  z.object({ type: z.literal("data_requested"), tool: z.string(), input: z.unknown() }),
  z.object({ type: z.literal("data_received"), tool: z.string(), latencyMs: z.number(), source: SourceClassSchema }),
  z.object({ type: z.literal("candidates_summary"), evaluated: z.number().int(), feasible: z.number().int() }),
  z.object({ type: z.literal("candidate_evaluated"), planId: z.string(), score: z.number(), violations: z.array(z.string()) }),
  z.object({ type: z.literal("decision"), summary: z.string() }),
  z.object({ type: z.literal("plan_result"), result: PlanResultSchema }),
  z.object({ type: z.literal("response_chunk"), text: z.string() }),
  z.object({ type: z.literal("moment_package"), pkg: MomentPackageSchema }),
  z.object({ type: z.literal("recap_result"), memory: z.unknown() }), // validated as GameMemory before emit
  z.object({ type: z.literal("fallback_used"), reason: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("done") }),
]);
export type TraceEvent = z.infer<typeof TraceEventSchema>;
export const TraceEnvelopeSchema = z.object({
  v: z.literal(TRACE_SCHEMA_VERSION),
  requestId: z.string(),
  seq: z.number().int().min(0),
  event: TraceEventSchema,
});
export type TraceEnvelope = z.infer<typeof TraceEnvelopeSchema>;

// ---------- model outputs (narrative) ----------
export const GameMemorySchema = z.object({
  headline: z.string().max(160),
  scoreLine: z.string(), // must equal MomentPackage.scoreLine verbatim, server-checked
  momentBlurbs: z.array(z.object({ momentId: z.string(), text: z.string().max(300) })).min(1).max(3),
  yourNight: z.string().max(400).optional(), // only when a validated session bridge exists, server-stripped otherwise
  reflection: z.string().max(300),
  copyText: z.string().max(600),
});
export type GameMemory = z.infer<typeof GameMemorySchema>;

/** Narrow explanation input: structurally excludes boxScore and playByPlay. Plan mode must not know the outcome. */
export const PlanSummaryForModelSchema = z.object({
  gateName: z.string(),
  standNames: z.array(z.string()),
  transitLabel: z.string().optional(), // "Lakeshore West, arrives 18:15"
  seatedClock: z.string(),
  seatSection: z.string(),
  walkingMinutes: z.number(),
  waitMinutes: z.number(),
  estimatedCostCad: z.number(),
  satisfied: z.array(z.string()),
  traded: z.array(z.string()),
  violated: z.array(z.string()),
}).strict();
export const ExplainInputSchema = z
  .object({
    selected: PlanSummaryForModelSchema,
    runnerUp: PlanSummaryForModelSchema.optional(),
    runnerUpDeltas: z.array(z.string()), // pre-computed numeric claims, e.g. "Gate 5B adds 4 walking minutes, saves 9 queue minutes"
    adjustments: z.array(ConstraintAdjustmentSchema),
  })
  .strict();
export type ExplainInput = z.infer<typeof ExplainInputSchema>;

// ---------- API inputs ----------
export const PlanApiInputSchema = z.object({
  mode: z.literal("plan"),
  text: z.string().min(1).max(INPUT_CHAR_CAP),
  chipId: z.enum(["family", "budget", "access"]).optional(),
  demo: z.boolean().default(false),
  disruptions: z.array(DisruptionIdSchema).max(5).default([]),
  priorPlanId: z.string().optional(),
  sessionContext: z.unknown().optional(),
});
export type PlanApiInput = z.infer<typeof PlanApiInputSchema>;
export const ReliveApiInputSchema = z.object({
  mode: z.literal("relive"),
  gameId: z.string().max(20),
  live: z.boolean().default(false),
  demo: z.boolean().default(false),
  sessionContext: z.unknown().optional(),
});
export type ReliveApiInput = z.infer<typeof ReliveApiInputSchema>;
export const AccessApiInputSchema = z.object({ code: z.string().min(1).max(100) });
