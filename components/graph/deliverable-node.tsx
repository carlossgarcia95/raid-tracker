import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NODE_WIDTH } from "@/lib/graph-layout";

export type DeliverableNodeData = {
  title: string;
  status: "not_started" | "in_progress" | "blocked" | "done";
  teamName: string;
  teamColor: string;
  effectiveRag: "green" | "amber" | "red";
  dimmed: boolean;
};
export type DeliverableNodeType = Node<DeliverableNodeData, "deliverable">;

const STATUS_LABEL: Record<DeliverableNodeData["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

// Color carries exactly one meaning on this graph: risk. A neutral card is
// healthy; a colored left rail + soft tint is the only thing meant to catch the
// eye. Team identity is demoted to a small dot, not a competing color field.
const RISK_CLASS: Record<DeliverableNodeData["effectiveRag"], string> = {
  green: "bg-background",
  amber: "border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/40",
  red: "border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950/40",
};

export const DeliverableNode = memo(function DeliverableNode({
  data,
}: NodeProps<DeliverableNodeType>) {
  const isBlocked = data.status === "blocked";
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 shadow-sm transition-opacity",
        RISK_CLASS[data.effectiveRag],
        data.dimmed && "opacity-25",
      )}
      style={{ width: NODE_WIDTH }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="truncate text-sm font-medium leading-tight">{data.title}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="truncate">{data.teamName}</span>
        <span aria-hidden>·</span>
        <span
          className={cn(
            "shrink-0",
            isBlocked && "font-medium text-red-600 dark:text-red-400",
          )}
        >
          {STATUS_LABEL[data.status]}
        </span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
