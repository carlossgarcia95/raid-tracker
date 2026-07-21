// Pure roll-ups over the cascade result — no Convex ctx, unit-tested in isolation
// (mirrors graphAnalysis.ts). Nothing here is persisted (derived at read time).
import type { Severity } from "./graphAnalysis";

export type RagCounts = { green: number; amber: number; red: number };
export type Totals = RagCounts & { total: number };

// Plain inputs (not Convex Docs) so this stays ctx-free and trivially testable.
export type RollupDeliverable = {
  id: string;
  title: string;
  owningTeamId: string;
  effectiveRag: Severity;
  reasons: string[];
};
export type RollupTeam = { id: string; name: string; color: string };
export type RollupRisk = {
  score: number;
  status: "open" | "mitigating" | "closed";
  title: string;
  teamName: string;
};
export type RollupIssue = {
  status: "open" | "in_progress" | "resolved";
  severity: "low" | "medium" | "high" | "critical";
};
export type RollupAssumption = {
  validationStatus: "unvalidated" | "validated" | "invalidated";
};

export type TeamHealth = {
  teamId: string;
  name: string;
  color: string;
  rag: Severity;
  counts: RagCounts;
  total: number;
};
export type TopBlocker = {
  deliverableId: string;
  title: string;
  teamName: string;
  effectiveRag: Severity;
  downstreamCount: number;
  reasons: string[];
};
export type RaidSummary = {
  risks: {
    open: number;
    mitigating: number;
    closed: number;
    topOpenByScore: { title: string; score: number; teamName: string }[];
  };
  issues: {
    open: number;
    inProgress: number;
    resolved: number;
    bySeverity: { low: number; medium: number; high: number; critical: number };
  };
  assumptions: { unvalidated: number; validated: number; invalidated: number };
};
export type DashboardPayload = {
  program: { name: string; status: string } | null;
  programRag: Severity;
  deliverableTotals: Totals;
  dependencyTotals: Totals;
  atRisk: { deliverables: number; dependencies: number; cycles: number };
  teams: TeamHealth[];
  topBlockers: TopBlocker[];
  raid: RaidSummary;
};

export type RollupInput = {
  program: { name: string; status: string } | null;
  deliverables: RollupDeliverable[];
  edgeRags: Severity[];
  teams: RollupTeam[];
  downstreamCount: Record<string, number>;
  cycleCount: number;
  risks: RollupRisk[];
  issues: RollupIssue[];
  assumptions: RollupAssumption[];
};

const RANK: Record<Severity, number> = { green: 0, amber: 1, red: 2 };
const worse = (a: Severity, b: Severity): Severity => (RANK[a] >= RANK[b] ? a : b);

function tally(rags: Severity[]): Totals {
  const counts: RagCounts = { green: 0, amber: 0, red: 0 };
  for (const r of rags) counts[r]++;
  return { ...counts, total: rags.length };
}
const atRiskCount = (t: Totals): number => t.amber + t.red;

export function rollUp(input: RollupInput): DashboardPayload {
  const {
    program, deliverables, edgeRags, teams,
    downstreamCount, cycleCount, risks, issues, assumptions,
  } = input;

  const deliverableTotals = tally(deliverables.map((d) => d.effectiveRag));
  const dependencyTotals = tally(edgeRags);
  const programRag = deliverables.reduce<Severity>(
    (acc, d) => worse(acc, d.effectiveRag),
    "green",
  );

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const healthById = new Map<string, TeamHealth>();
  for (const t of teams) {
    healthById.set(t.id, {
      teamId: t.id, name: t.name, color: t.color,
      rag: "green", counts: { green: 0, amber: 0, red: 0 }, total: 0,
    });
  }
  for (const d of deliverables) {
    const h = healthById.get(d.owningTeamId);
    if (!h) continue;
    h.counts[d.effectiveRag]++;
    h.total++;
    h.rag = worse(h.rag, d.effectiveRag);
  }
  const teamsHealth = [...healthById.values()].sort(
    (a, b) =>
      RANK[b.rag] - RANK[a.rag] ||
      b.counts.red - a.counts.red ||
      a.name.localeCompare(b.name),
  );

  const topBlockers: TopBlocker[] = deliverables
    .filter((d) => d.effectiveRag !== "green" && (downstreamCount[d.id] ?? 0) > 0)
    .map((d) => ({
      deliverableId: d.id,
      title: d.title,
      teamName: teamById.get(d.owningTeamId)?.name ?? "—",
      effectiveRag: d.effectiveRag,
      downstreamCount: downstreamCount[d.id] ?? 0,
      reasons: d.reasons,
    }))
    .sort((a, b) => b.downstreamCount - a.downstreamCount || a.title.localeCompare(b.title))
    .slice(0, 5);

  const openRisks = risks.filter((r) => r.status === "open");
  const raid: RaidSummary = {
    risks: {
      open: openRisks.length,
      mitigating: risks.filter((r) => r.status === "mitigating").length,
      closed: risks.filter((r) => r.status === "closed").length,
      topOpenByScore: [...openRisks]
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, 3)
        .map((r) => ({ title: r.title, score: r.score, teamName: r.teamName })),
    },
    issues: {
      open: issues.filter((i) => i.status === "open").length,
      inProgress: issues.filter((i) => i.status === "in_progress").length,
      resolved: issues.filter((i) => i.status === "resolved").length,
      bySeverity: issues
        .filter((i) => i.status !== "resolved")
        .reduce(
          (acc, i) => {
            acc[i.severity]++;
            return acc;
          },
          { low: 0, medium: 0, high: 0, critical: 0 },
        ),
    },
    assumptions: {
      unvalidated: assumptions.filter((a) => a.validationStatus === "unvalidated").length,
      validated: assumptions.filter((a) => a.validationStatus === "validated").length,
      invalidated: assumptions.filter((a) => a.validationStatus === "invalidated").length,
    },
  };

  return {
    program,
    programRag,
    deliverableTotals,
    dependencyTotals,
    atRisk: {
      deliverables: atRiskCount(deliverableTotals),
      dependencies: atRiskCount(dependencyTotals),
      cycles: cycleCount,
    },
    teams: teamsHealth,
    topBlockers,
    raid,
  };
}
