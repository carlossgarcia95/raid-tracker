import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { RAG_STROKE } from "./dependency-edge";

type NeighborRow = {
  id: string;
  title: string;
  teamName: string;
  rag: "green" | "amber" | "red";
  neededByDate: number;
  slackDays: number | null;
};

type SelectedNode = {
  title: string;
  teamName: string;
  status: string;
};

const fmt = (ms: number) => new Date(ms).toLocaleDateString();
const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

function NeighborList({
  heading,
  rows,
  onSelect,
}: {
  heading: string;
  rows: NeighborRow[];
  onSelect: (id: string) => void;
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
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className="flex w-full flex-col gap-0.5 rounded-md border p-2 text-left hover:bg-accent"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span
                    className="inline-block size-2 shrink-0 rounded-full"
                    style={{ background: RAG_STROKE[r.rag] }}
                  />
                  <span className="truncate">{r.title}</span>
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
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NodeInspectorPanel({
  node,
  upstream,
  downstream,
  onSelect,
  onClose,
}: {
  node: SelectedNode;
  upstream: NeighborRow[];
  downstream: NeighborRow[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <aside className="absolute right-0 top-0 z-10 flex h-full w-80 flex-col gap-4 overflow-y-auto border-l bg-background p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-base font-medium">{node.title}</div>
          <div className="text-xs text-muted-foreground">
            {node.teamName} · {STATUS_LABEL[node.status] ?? node.status}
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>
      <NeighborList heading="Depends on" rows={upstream} onSelect={onSelect} />
      <NeighborList heading="Depended on by" rows={downstream} onSelect={onSelect} />
    </aside>
  );
}
