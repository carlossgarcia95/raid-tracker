import { type FunctionReturnType } from "convex/server";
import { type api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Dashboard = FunctionReturnType<typeof api.dashboard.get>;
type Raid = Dashboard["raid"];

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function RaidSummary({ raid }: { raid: Raid }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader><CardTitle className="text-base">Risks</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          <Stat label="Open" value={raid.risks.open} />
          <Stat label="Mitigating" value={raid.risks.mitigating} />
          <Stat label="Closed" value={raid.risks.closed} />
          {raid.risks.topOpenByScore.length > 0 && (
            <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
              Highest score: {raid.risks.topOpenByScore[0].title} ({raid.risks.topOpenByScore[0].score})
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Issues</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          <Stat label="Open" value={raid.issues.open} />
          <Stat label="In progress" value={raid.issues.inProgress} />
          <Stat label="Critical (active)" value={raid.issues.bySeverity.critical} />
          <Stat label="High (active)" value={raid.issues.bySeverity.high} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Assumptions</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          <Stat label="Unvalidated" value={raid.assumptions.unvalidated} />
          <Stat label="Invalidated" value={raid.assumptions.invalidated} />
          <Stat label="Validated" value={raid.assumptions.validated} />
        </CardContent>
      </Card>
    </div>
  );
}
