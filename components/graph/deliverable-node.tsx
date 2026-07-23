import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  CircleIcon,
  CircleDotIcon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
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

// Status shows as an icon + label, with the icon color-coded by lifecycle
// state. This is a deliberate, scoped exception to the graph's "color means
// risk" rule: the small status glyph carries a second signal (progress) that
// stays visually distinct from the RAG risk rail on the card's left edge.
const STATUS_META: Record<
  DeliverableNodeData["status"],
  { label: string; icon: IconSvgElement; iconColor: string }
> = {
  not_started: {
    label: "Not started",
    icon: CircleIcon,
    iconColor: "text-muted-foreground",
  },
  in_progress: {
    label: "In progress",
    icon: CircleDotIcon,
    iconColor: "text-blue-500 dark:text-blue-400",
  },
  blocked: {
    label: "Blocked",
    icon: CancelCircleIcon,
    iconColor: "text-red-600 dark:text-red-400",
  },
  done: {
    label: "Done",
    icon: CheckmarkCircle02Icon,
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
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
  const status = STATUS_META[data.status];
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 shadow-sm transition-opacity",
        RISK_CLASS[data.effectiveRag],
        data.dimmed && "opacity-25",
      )}
      style={{ width: NODE_WIDTH }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-3.5 !rounded-full !border-2 !border-muted-foreground !bg-background"
      />
      <div className="truncate text-sm font-medium leading-tight">
        {data.title}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          className={cn(
            "flex shrink-0 items-center gap-1",
            isBlocked && "font-medium text-red-600 dark:text-red-400",
          )}
        >
          <HugeiconsIcon
            icon={status.icon}
            strokeWidth={2}
            className={cn("size-3.5", status.iconColor)}
            aria-hidden
          />
          {status.label}
        </span>
        <span aria-hidden>·</span>
        <span className="truncate">{data.teamName}</span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!size-3.5 !rounded-full !border-2 !border-muted-foreground !bg-background"
      />
    </div>
  );
});
