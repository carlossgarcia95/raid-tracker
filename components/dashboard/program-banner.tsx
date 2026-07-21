import { type FunctionReturnType } from "convex/server";
import { type api } from "@/convex/_generated/api";
import { RAG_DOT, RAG_LABEL } from "@/lib/rag";
import { cn } from "@/lib/utils";

type Dashboard = FunctionReturnType<typeof api.dashboard.get>;

export function ProgramBanner({
  program,
  programRag,
  atRisk,
}: {
  program: NonNullable<Dashboard["program"]>;
  programRag: Dashboard["programRag"];
  atRisk: Dashboard["atRisk"];
}) {
  const bits = [
    `${atRisk.deliverables} deliverable${atRisk.deliverables === 1 ? "" : "s"} at risk`,
    atRisk.cycles > 0 && `${atRisk.cycles} cycle${atRisk.cycles === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
      <div>
        <h1 className="text-2xl font-semibold">{program.name}</h1>
        <p className="text-sm text-muted-foreground">{bits.join(" · ")}</p>
      </div>
      <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium">
        <span className={cn("size-2.5 rounded-full", RAG_DOT[programRag])} />
        {RAG_LABEL[programRag]}
      </span>
    </div>
  );
}
