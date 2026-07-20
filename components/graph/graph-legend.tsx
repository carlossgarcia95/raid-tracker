import { Panel } from "@xyflow/react";
import { RAG_STROKE } from "./dependency-edge";

export function GraphLegend() {
  return (
    <Panel
      position="top-left"
      className="rounded-md border bg-background/90 p-2 text-xs shadow-sm backdrop-blur"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          {(["green", "amber", "red"] as const).map((rag) => (
            <span key={rag} className="flex items-center gap-1">
              <span
                className="inline-block h-0.5 w-4"
                style={{ background: RAG_STROKE[rag] }}
              />
              {rag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-foreground" /> blocking
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-0.5 w-4 bg-foreground"
              style={{ backgroundImage: "none", borderTop: "2px dashed currentColor" }}
            />
            soft
          </span>
        </div>
      </div>
    </Panel>
  );
}
