import { type FunctionReturnType } from "convex/server";
import { type api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RAG_DOT, RAG_LABEL } from "@/lib/rag";
import { cn } from "@/lib/utils";

type Dashboard = FunctionReturnType<typeof api.dashboard.get>;

export function TopBlockers({ blockers }: { blockers: Dashboard["topBlockers"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top blockers</CardTitle>
      </CardHeader>
      <CardContent>
        {blockers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing at risk is blocking downstream work.</p>
        ) : (
          <ol className="space-y-3">
            {blockers.map((b) => (
              <li key={b.deliverableId} className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <span
                      className={cn("size-2 rounded-full", RAG_DOT[b.effectiveRag])}
                      title={RAG_LABEL[b.effectiveRag]}
                    />
                    <span className="sr-only">{RAG_LABEL[b.effectiveRag]}</span>
                    {b.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {b.teamName}
                    {b.reasons.length > 0 && ` · ${b.reasons.join(", ")}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-lg font-semibold tabular-nums">{b.downstreamCount}</div>
                  <div className="text-xs text-muted-foreground">downstream</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
