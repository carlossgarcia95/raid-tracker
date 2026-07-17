// convex/schema.ts
//
// Cross-Team RAID & Dependency Tracker — Convex schema.
//
// Design notes baked in below:
// - Deliverables are graph NODES; Dependencies are graph EDGES between them.
// - Dependency carries BOTH neededByDate and committedDate. The gap between
//   them is where emergent cross-team risk shows up — computed in code, not stored.
// - v.id(...) references are NOT enforced by the database. Integrity is your
//   mutations' job (e.g. when deleting a Deliverable, delete its edges too).
// - Dates are stored as Unix-ms timestamps (v.number()). Convex has no date type.
// - Every doc gets _id and _creationTime for free — no manual id/createdAt fields.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Reusable validators (shared enums)
// ---------------------------------------------------------------------------

const programStatus = v.union(
  v.literal("planning"),
  v.literal("active"),
  v.literal("at_risk"),
  v.literal("done"),
);

const deliverableStatus = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("blocked"),
  v.literal("done"),
);

// Red / Amber / Green. May be set manually AND overridden by cascade analysis.
const rag = v.union(
  v.literal("green"),
  v.literal("amber"),
  v.literal("red"),
);

const riskStatus = v.union(
  v.literal("open"),
  v.literal("mitigating"),
  v.literal("closed"),
);

const validationStatus = v.union(
  v.literal("unvalidated"),
  v.literal("validated"),
  v.literal("invalidated"),
);

const issueSeverity = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

const issueStatus = v.union(
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("resolved"),
);

// StatusChange references any of the trackable entities.
const entityType = v.union(
  v.literal("deliverable"),
  v.literal("dependency"),
  v.literal("risk"),
  v.literal("assumption"),
  v.literal("issue"),
);

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export default defineSchema({
  programs: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    startDate: v.optional(v.number()),
    targetDate: v.optional(v.number()),
    status: programStatus,
  }).index("by_status", ["status"]),

  teams: defineTable({
    name: v.string(),
    leadName: v.optional(v.string()),
    color: v.string(), // hex, used for graph node/edge rendering
  }),

  // Graph NODES.
  deliverables: defineTable({
    programId: v.id("programs"),
    owningTeamId: v.id("teams"),
    title: v.string(),
    description: v.optional(v.string()),
    status: deliverableStatus,
    targetDate: v.optional(v.number()),
    actualDate: v.optional(v.number()), // set when status -> done
  })
    .index("by_program", ["programId"])
    .index("by_owning_team", ["owningTeamId"])
    .index("by_program_status", ["programId", "status"]),

  // Graph EDGES. provider -> consumer ("consumer needs something from provider").
  // The by_provider / by_consumer indexes are what make cascade traversal fast:
  // walking downstream = repeatedly querying by_provider from a starting node.
  dependencies: defineTable({
    providerDeliverableId: v.id("deliverables"), // the thing being waited on
    consumerDeliverableId: v.id("deliverables"), // the thing waiting
    description: v.optional(v.string()),
    neededByDate: v.number(), // when the consumer needs it
    committedDate: v.optional(v.number()), // when the provider says it'll be ready
    rag: rag, // manual baseline; cascade may push this to red
    isBlocking: v.boolean(), // hard block vs. soft dependency
    // slackDays = neededByDate - committedDate is DERIVED in code, not stored.
  })
    .index("by_provider", ["providerDeliverableId"])
    .index("by_consumer", ["consumerDeliverableId"])
    .index("by_rag", ["rag"]),

  // --- RAID: R / A / I as separate tables (recommended option from the spec) ---

  risks: defineTable({
    programId: v.id("programs"),
    owningTeamId: v.id("teams"),
    title: v.string(),
    description: v.optional(v.string()),
    probability: v.number(), // 1-5
    impact: v.number(), // 1-5
    // score = probability * impact is derived in code (keep it out of the DB
    // so it can never drift from its inputs).
    mitigation: v.optional(v.string()),
    ownerName: v.optional(v.string()),
    status: riskStatus,
  })
    .index("by_program", ["programId"])
    .index("by_owning_team", ["owningTeamId"])
    .index("by_program_status", ["programId", "status"]),

  assumptions: defineTable({
    programId: v.id("programs"),
    title: v.string(),
    description: v.optional(v.string()),
    validationStatus: validationStatus,
    validateByDate: v.optional(v.number()),
    ownerName: v.optional(v.string()),
  })
    .index("by_program", ["programId"])
    .index("by_program_validation", ["programId", "validationStatus"]),

  issues: defineTable({
    programId: v.id("programs"),
    owningTeamId: v.id("teams"),
    title: v.string(),
    description: v.optional(v.string()),
    severity: issueSeverity,
    status: issueStatus,
    resolution: v.optional(v.string()),
    raisedDate: v.number(),
    resolvedDate: v.optional(v.number()),
  })
    .index("by_program", ["programId"])
    .index("by_owning_team", ["owningTeamId"])
    .index("by_program_status", ["programId", "status"]),

  // Audit log powering the weekly "what went at-risk this week" digest.
  // No explicit timestamp field — the digest cron queries by the built-in
  // _creationTime over a 7-day window.
  statusChanges: defineTable({
    entityType: entityType,
    entityId: v.string(), // stringified id of the changed doc
    field: v.string(),
    oldValue: v.optional(v.string()),
    newValue: v.optional(v.string()),
  }).index("by_entity", ["entityType", "entityId"]),
});
