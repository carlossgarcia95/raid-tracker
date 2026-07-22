import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RAG_STROKE } from "@/lib/rag";

export { RAG_STROKE };

export type DependencyEdgeData = {
  rag: "green" | "amber" | "red";
  effectiveRag: "green" | "amber" | "red";
  slackDays: number | null;
  neededByDate: number;
  committedDate?: number;
  description?: string;
  inCycle: boolean;
  dimmed: boolean;
};
export type DependencyEdgeType = Edge<DependencyEdgeData, "dependency">;

const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleDateString() : "—");

export function DependencyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<DependencyEdgeType>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const d = data!;
  // Cycle edges trace the loop: forced red, bolder, with an animated flowing
  // dash (dasharray + animation live in the .cycle-edge-path CSS class).
  const stroke = d.inCycle ? RAG_STROKE.red : RAG_STROKE[d.effectiveRag];

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={d.inCycle ? "cycle-edge-path" : undefined}
        style={{
          stroke,
          strokeWidth: d.inCycle ? 3 : 2,
          // Every dependency is a hard block → solid line. Cycle edges get their
          // animated dash from the .cycle-edge-path class.
          opacity: d.dimmed ? 0.15 : 1,
        }}
      />
      {d.slackDays !== null && (
        <EdgeLabelRenderer>
          <Tooltip>
            <TooltipTrigger
              className={cn(
                "nodrag nopan pointer-events-auto absolute rounded border bg-background px-1.5 py-0.5 text-[11px] font-medium shadow-sm",
                d.slackDays < 0 ? "text-red-600" : "text-foreground",
                d.dimmed && "opacity-25",
              )}
              style={{
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              }}
            >
              {d.slackDays > 0 ? `+${d.slackDays}d` : `${d.slackDays}d`}
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-0.5">
                <div>Needed by {fmt(d.neededByDate)}</div>
                <div>Committed {fmt(d.committedDate)}</div>
                {d.description && <div className="opacity-80">{d.description}</div>}
              </div>
            </TooltipContent>
          </Tooltip>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
