import { type FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import { type api } from "@/convex/_generated/api";
import { Card, CardContent } from "@/components/ui/card";
import { RAG_DOT, RAG_LABEL } from "@/lib/rag";
import { cn } from "@/lib/utils";

type Dashboard = FunctionReturnType<typeof api.dashboard.get>;
type Totals = Dashboard["deliverableTotals"];

// RAG breakdown for a tile. Dataviz note: the dot's hue is a WARN-level
// contrast risk on a light surface at this size (validate_palette.js), and
// hue alone is never a reliable identity channel (CVD, screen readers) — so
// every dot carries a visually-hidden RAG_LABEL alongside the visible count,
// and a native `title` tooltip for sighted mouse users. The fixed red/amber/
// green order (matching TeamHealthTable's "R / A / G" header) is itself a
// secondary, non-color identity channel.
function RagBar({ totals }: { totals: Totals }) {
  return (
    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
      {(["red", "amber", "green"] as const).map((rag) => (
        <span
          key={rag}
          className="inline-flex items-center gap-1"
          title={RAG_LABEL[rag]}
        >
          <span className={cn("size-2 rounded-full", RAG_DOT[rag])} />
          <span className="tabular-nums">{totals[rag]}</span>
          <span className="sr-only"> {RAG_LABEL[rag]}</span>
        </span>
      ))}
    </div>
  );
}

// Stat-tile contract (dataviz): sentence-case label with no trailing colon,
// and a semibold value in the default proportional figure style — tabular
// figures are reserved for columns of numbers that must align (table rows,
// axis ticks), and make a single standalone hero number look loose.
function Tile({
  label,
  value,
  children,
}: {
  label: string;
  value: number;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="mt-1 text-3xl font-semibold">{value}</div>
        {children}
      </CardContent>
    </Card>
  );
}

export function StatTiles({
  deliverableTotals,
  dependencyTotals,
  atRisk,
}: {
  deliverableTotals: Dashboard["deliverableTotals"];
  dependencyTotals: Dashboard["dependencyTotals"];
  atRisk: Dashboard["atRisk"];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label="Deliverables" value={deliverableTotals.total}>
        <RagBar totals={deliverableTotals} />
      </Tile>
      <Tile label="Dependencies" value={dependencyTotals.total}>
        <RagBar totals={dependencyTotals} />
      </Tile>
      <Tile label="At risk" value={atRisk.deliverables + atRisk.dependencies} />
      <Tile label="Cycles" value={atRisk.cycles} />
    </div>
  );
}
