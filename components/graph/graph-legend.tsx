import { Panel } from "@xyflow/react";
import { RAG_STROKE, RAG_LABEL } from "@/lib/rag";

export function GraphLegend() {
  return (
    <Panel
      position="top-left"
      className="rounded-md border bg-background/90 p-2 text-xs shadow-sm backdrop-blur"
    >
      <div className="flex flex-col gap-1.5">
        {/* Color = risk, on both nodes and edges. */}
        <div className="flex items-center gap-3">
          {(["green", "amber", "red"] as const).map((rag) => (
            <span key={rag} className="flex items-center gap-1">
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: RAG_STROKE[rag] }}
              />
              {RAG_LABEL[rag]}
            </span>
          ))}
        </div>
        {/* An animated red dashed edge marks a circular dependency. */}
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-0 w-4"
              style={{ borderTop: `2.5px dashed ${RAG_STROKE.red}` }}
            />
            circular dependency
          </span>
        </div>
      </div>
    </Panel>
  );
}
