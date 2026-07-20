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
  inCycle: boolean;
  dimmed: boolean;
};
export type DeliverableNodeType = Node<DeliverableNodeData, "deliverable">;

const STATUS_LABEL: Record<DeliverableNodeData["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export const DeliverableNode = memo(function DeliverableNode({
  data,
}: NodeProps<DeliverableNodeType>) {
  const ringByRag: Record<DeliverableNodeData["effectiveRag"], string> = {
    green: "",
    amber: "ring-2 ring-amber-500",
    red: "ring-2 ring-red-500",
  };
  return (
    <div
      className={cn(
        "rounded-md border bg-background px-3 py-2 shadow-sm transition-opacity",
        ringByRag[data.effectiveRag],
        data.inCycle &&
          "outline outline-2 outline-dashed outline-purple-500 outline-offset-2",
        data.dimmed && "opacity-25",
      )}
      style={{ width: NODE_WIDTH, borderLeft: `4px solid ${data.teamColor}` }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="truncate text-sm font-medium leading-tight">{data.title}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          className="inline-block size-2 shrink-0 rounded-full"
          style={{ background: data.teamColor }}
        />
        <span className="truncate">{data.teamName}</span>
        <span>·</span>
        <span className="shrink-0">{STATUS_LABEL[data.status]}</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
