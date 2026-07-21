"use client";

import { type Preloaded, usePreloadedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ProgramBanner } from "./program-banner";
import { StatTiles } from "./stat-tiles";
import { TeamHealthTable } from "./team-health-table";
import { TopBlockers } from "./top-blockers";
import { RaidSummary } from "./raid-summary";

export function DashboardView({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.dashboard.get>;
}) {
  const data = usePreloadedQuery(preloaded);

  if (!data.program) {
    return (
      <p className="text-sm text-muted-foreground">
        No active program. Seed the database to populate the dashboard.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <ProgramBanner program={data.program} programRag={data.programRag} atRisk={data.atRisk} />
      <StatTiles
        deliverableTotals={data.deliverableTotals}
        dependencyTotals={data.dependencyTotals}
        atRisk={data.atRisk}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <TeamHealthTable teams={data.teams} />
        <TopBlockers blockers={data.topBlockers} />
      </div>
      <RaidSummary raid={data.raid} />
    </div>
  );
}
