// Pure weekly-digest composition. No Convex ctx here, so it unit-tests in
// isolation (mirrors model/graphAnalysis.ts). Nothing is persisted from this
// file — runDigest (in the same file) does the DB read/write.
import type { Doc, Id } from "../_generated/dataModel";
import { slackDays } from "./derived";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Higher = worse. "blocked" is the risk state; "done" is best.
const DELIV_RANK: Record<string, number> = {
  done: 0,
  not_started: 1,
  in_progress: 1,
  blocked: 3,
};
const RAG_RANK: Record<string, number> = { green: 0, amber: 1, red: 2 };

export type DigestContext = {
  deliverableById: Map<Id<"deliverables">, Doc<"deliverables">>;
  teamById: Map<Id<"teams">, Doc<"teams">>;
  edgeById: Map<Id<"dependencies">, Doc<"dependencies">>;
  reach: Record<string, number>; // downstreamReach() by deliverable id
};

export type DigestResult = {
  weekKey: string;
  periodStart: number;
  periodEnd: number;
  markdown: string;
  worsenedCount: number;
  improvedCount: number;
  totalChanges: number;
};

export function mondayOfWeekUTC(ms: number): number {
  const d = new Date(ms);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday);
}

function isoDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function weekKeyOf(ms: number): string {
  return isoDate(mondayOfWeekUTC(ms));
}

type Direction = "worse" | "better" | "other";
type Classified = { direction: Direction; line: string; team: string };

function rankDir(rank: Record<string, number>, oldV?: string, newV?: string): Direction {
  const o = oldV !== undefined ? rank[oldV] : undefined;
  const n = newV !== undefined ? rank[newV] : undefined;
  if (o === undefined || n === undefined) return "other";
  if (n > o) return "worse";
  if (n < o) return "better";
  return "other";
}

function classify(c: Doc<"statusChanges">, g: DigestContext): Classified {
  if (c.entityType === "deliverable" && c.field === "status") {
    const d = g.deliverableById.get(c.entityId as Id<"deliverables">);
    const title = d?.title ?? "(removed)";
    const teamName = d ? g.teamById.get(d.owningTeamId)?.name ?? "—" : "—";
    const dir = rankDir(DELIV_RANK, c.oldValue, c.newValue);
    const reach = g.reach[c.entityId] ?? 0;
    let line = `**${title}** moved \`${c.oldValue} → ${c.newValue}\``;
    if (dir === "worse" && reach > 0) {
      line += ` — blocks **${reach}** downstream deliverable${reach === 1 ? "" : "s"}`;
    }
    return { direction: dir, line, team: teamName };
  }

  if (c.entityType === "dependency" && c.field === "rag") {
    const e = g.edgeById.get(c.entityId as Id<"dependencies">);
    const prov = e ? g.deliverableById.get(e.providerDeliverableId) : undefined;
    const cons = e ? g.deliverableById.get(e.consumerDeliverableId) : undefined;
    const provTitle = prov?.title ?? "(removed)";
    const consTitle = cons?.title ?? "(removed)";
    const teamName = cons ? g.teamById.get(cons.owningTeamId)?.name ?? "—" : "—";
    const dir = rankDir(RAG_RANK, c.oldValue, c.newValue);
    let line = `**${provTitle} → ${consTitle}** dependency went \`${c.oldValue} → ${c.newValue}\``;
    if (e) {
      const s = slackDays(e.neededByDate, e.committedDate);
      if (s !== null) line += ` — ${s} day${Math.abs(s) === 1 ? "" : "s"} slack`;
    }
    return { direction: dir, line, team: teamName };
  }

  return {
    direction: "other",
    line: `${c.entityType} ${c.field} \`${c.oldValue} → ${c.newValue}\``,
    team: "—",
  };
}

function groupByTeam(items: Classified[]): [string, Classified[]][] {
  const m = new Map<string, Classified[]>();
  for (const it of items) {
    if (!m.has(it.team)) m.set(it.team, []);
    m.get(it.team)!.push(it);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function composeDigest(
  changes: Doc<"statusChanges">[],
  gctx: DigestContext,
  now: number,
): DigestResult {
  const periodStart = now - WEEK_MS;
  const periodEnd = now;
  const weekKey = weekKeyOf(now);

  const classified = changes.map((c) => classify(c, gctx));
  const worse = classified.filter((c) => c.direction === "worse");
  const better = classified.filter((c) => c.direction === "better");
  const other = classified.filter((c) => c.direction === "other");

  const lines: string[] = [];
  lines.push(`# Weekly Digest — Week of ${weekKey}`);
  lines.push(`_${isoDate(periodStart)} – ${isoDate(periodEnd)}_`);
  lines.push("");
  lines.push(`**${worse.length} went at-risk · ${better.length} recovered · ${classified.length} changes**`);

  if (classified.length === 0) {
    lines.push("");
    lines.push("No tracked status changes in the last 7 days — all quiet.");
  }

  if (worse.length) {
    lines.push("");
    lines.push("## ⚠️ Went at-risk this week");
    for (const [teamName, items] of groupByTeam(worse)) {
      lines.push(`### ${teamName}`);
      for (const it of items) lines.push(`- ${it.line}`);
    }
  }

  if (better.length) {
    lines.push("");
    lines.push("## ✅ Recovered / improved");
    for (const it of better) lines.push(`- ${it.line}`);
  }

  if (other.length) {
    lines.push("");
    lines.push("## Other changes");
    for (const it of other) lines.push(`- ${it.line}`);
  }

  return {
    weekKey,
    periodStart,
    periodEnd,
    markdown: lines.join("\n"),
    worsenedCount: worse.length,
    improvedCount: better.length,
    totalChanges: classified.length,
  };
}
