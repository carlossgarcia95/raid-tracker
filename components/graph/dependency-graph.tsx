"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type Preloaded, usePreloadedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { layoutGraph } from "@/lib/graph-layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DeliverableNode, type DeliverableNodeType } from "./deliverable-node";
import { DependencyEdge, RAG_STROKE, type DependencyEdgeType } from "./dependency-edge";
import { GraphLegend } from "./graph-legend";
import { NodeInspectorPanel } from "./node-inspector-panel";

const nodeTypes: NodeTypes = { deliverable: DeliverableNode };
const edgeTypes: EdgeTypes = { dependency: DependencyEdge };

export function DependencyGraph({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.graph.get>;
}) {
  const data = usePreloadedQuery(preloaded);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nodeById = useMemo(
    () => new Map(data.nodes.map((n) => [n.id, n])),
    [data.nodes],
  );
  type NodeId = (typeof data.nodes)[number]["id"];

  // Direct neighbors only (one hop) — transitive traversal is Phase 3.
  const neighborIds = useMemo(() => {
    const s = new Set<string>();
    if (!selectedId) return s;
    for (const e of data.edges) {
      if (e.source === selectedId) s.add(e.target);
      if (e.target === selectedId) s.add(e.source);
    }
    return s;
  }, [selectedId, data.edges]);

  const upstream = useMemo(
    () =>
      selectedId
        ? data.edges
            .filter((e) => e.target === selectedId)
            .map((e) => {
              const o = nodeById.get(e.source)!;
              return {
                id: o.id,
                title: o.title,
                teamName: o.teamName,
                rag: e.rag,
                neededByDate: e.neededByDate,
                slackDays: e.slackDays,
              };
            })
        : [],
    [selectedId, data.edges, nodeById],
  );

  const downstream = useMemo(
    () =>
      selectedId
        ? data.edges
            .filter((e) => e.source === selectedId)
            .map((e) => {
              const o = nodeById.get(e.target)!;
              return {
                id: o.id,
                title: o.title,
                teamName: o.teamName,
                rag: e.rag,
                neededByDate: e.neededByDate,
                slackDays: e.slackDays,
              };
            })
        : [],
    [selectedId, data.edges, nodeById],
  );

  const selectedNode = selectedId
    ? nodeById.get(selectedId as NodeId) ?? null
    : null;

  const positions = useMemo(
    () =>
      layoutGraph(
        data.nodes.map((n) => ({ id: n.id })),
        data.edges.map((e) => ({ source: e.source, target: e.target })),
      ),
    [data.nodes, data.edges],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<DeliverableNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<DependencyEdgeType>([]);

  useEffect(() => {
    setNodes(
      data.nodes.map((n) => ({
        id: n.id,
        type: "deliverable",
        position: positions[n.id] ?? { x: 0, y: 0 },
        data: {
          title: n.title,
          status: n.status,
          teamName: n.teamName,
          teamColor: n.teamColor,
          dimmed:
            selectedId !== null && n.id !== selectedId && !neighborIds.has(n.id),
        },
      })),
    );
  }, [data.nodes, positions, setNodes, selectedId, neighborIds]);

  useEffect(() => {
    setEdges(
      data.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "dependency",
        markerEnd: { type: MarkerType.ArrowClosed, color: RAG_STROKE[e.rag] },
        data: {
          rag: e.rag,
          isBlocking: e.isBlocking,
          slackDays: e.slackDays,
          neededByDate: e.neededByDate,
          committedDate: e.committedDate,
          description: e.description,
          dimmed:
            selectedId !== null &&
            e.source !== selectedId &&
            e.target !== selectedId,
        },
      })),
    );
  }, [data.edges, setEdges, selectedId]);

  if (data.nodes.length === 0) {
    return (
      <div className="flex h-[calc(100vh-9rem)] items-center justify-center rounded-md border text-sm text-muted-foreground">
        No deliverables in the active program yet.
      </div>
    );
  }

  return (
    <TooltipProvider delay={0}>
      <div className="relative h-[calc(100vh-9rem)] w-full rounded-md border">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          fitView
          colorMode="system"
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
        >
          <Background />
          <Controls showInteractive={false} />
          <GraphLegend />
        </ReactFlow>
        {selectedNode && (
          <NodeInspectorPanel
            node={selectedNode}
            upstream={upstream}
            downstream={downstream}
            onSelect={setSelectedId}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
