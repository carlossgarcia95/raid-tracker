import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { RAG_STROKE } from "./dependency-edge";

type Severity = "green" | "amber" | "red";
type DeliverableStatus = "not_started" | "in_progress" | "blocked" | "done";

type NeighborRow = {
  edgeId: string;
  id: string;
  title: string;
  teamName: string;
  effectiveRag: Severity;
  rag: Severity;
  reason?: string;
  neededByDate: number;
  slackDays: number | null;
};

type SelectedNode = {
  id: string;
  title: string;
  teamName: string;
  status: DeliverableStatus;
  effectiveRag: Severity;
  reasons: string[];
};

const fmt = (ms: number) => new Date(ms).toLocaleDateString();
const STATUS_OPTIONS: { value: DeliverableStatus; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];
const RAG_OPTIONS: Severity[] = ["green", "amber", "red"];

function NeighborList({
  heading,
  rows,
  onSelect,
  onSetRag,
}: {
  heading: string;
  rows: NeighborRow[];
  onSelect: (id: string) => void;
  onSetRag: (edgeId: string, rag: Severity) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {heading}
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">None</div>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.edgeId} className="rounded-md border p-2">
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className="flex w-full flex-col gap-0.5 text-left"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ background: RAG_STROKE[r.effectiveRag] }}
                  />
                  <span className="truncate hover:underline">{r.title}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {r.teamName} · needed {fmt(r.neededByDate)}
                  {r.slackDays !== null && (
                    <span className={r.slackDays < 0 ? " text-red-600" : ""}>
                      {" "}
                      · {r.slackDays > 0 ? `+${r.slackDays}` : r.slackDays}d slack
                    </span>
                  )}
                </span>
                {r.reason && (
                  <span className="text-xs italic text-muted-foreground">{r.reason}</span>
                )}
              </button>
              <label className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                RAG
                <select
                  value={r.rag}
                  onChange={(e) => onSetRag(r.edgeId, e.target.value as Severity)}
                  className="rounded border bg-background px-1 py-0.5 text-xs"
                >
                  {RAG_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NodeInspectorPanel({
  node,
  directUpstream,
  directDownstream,
  impactCount,
  onSelect,
  onSetStatus,
  onSetRag,
  onClose,
}: {
  node: SelectedNode;
  directUpstream: NeighborRow[];
  directDownstream: NeighborRow[];
  impactCount: number;
  onSelect: (id: string) => void;
  onSetStatus: (status: DeliverableStatus) => void;
  onSetRag: (edgeId: string, rag: Severity) => void;
  onClose: () => void;
}) {
  return (
    <aside className="absolute right-0 top-0 z-10 flex h-full w-80 flex-col gap-4 overflow-y-auto border-l bg-background p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 shrink-0 rounded-full"
            style={{ background: RAG_STROKE[node.effectiveRag] }}
          />
          <div className="text-base font-medium">{node.title}</div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        {node.teamName} · Status
        <select
          value={node.status}
          onChange={(e) => onSetStatus(e.target.value as DeliverableStatus)}
          className="rounded border bg-background px-1.5 py-0.5 text-xs text-foreground"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {node.reasons.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
          <div className="font-medium">Why at risk</div>
          <ul className="mt-0.5 list-disc pl-4">
            {node.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-sm">
        <span className="font-medium">Impact:</span> slipping this puts{" "}
        <span className="font-semibold">{impactCount}</span> downstream deliverable
        {impactCount === 1 ? "" : "s"} at risk.
      </div>

      <NeighborList
        heading="Depends on"
        rows={directUpstream}
        onSelect={onSelect}
        onSetRag={onSetRag}
      />
      <NeighborList
        heading="Depended on by"
        rows={directDownstream}
        onSelect={onSelect}
        onSetRag={onSetRag}
      />
    </aside>
  );
}
