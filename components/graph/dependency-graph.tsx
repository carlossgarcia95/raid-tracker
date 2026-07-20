"use client";

import { useEffect, useMemo } from "react";
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

const nodeTypes: NodeTypes = { deliverable: DeliverableNode };
const edgeTypes: EdgeTypes = { dependency: DependencyEdge };

export function DependencyGraph({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.graph.get>;
}) {
  const data = usePreloadedQuery(preloaded);

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
          dimmed: false,
        },
      })),
    );
  }, [data.nodes, positions, setNodes]);

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
          dimmed: false,
        },
      })),
    );
  }, [data.edges, setEdges]);

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
        >
          <Background />
          <Controls showInteractive={false} />
          <GraphLegend />
        </ReactFlow>
      </div>
    </TooltipProvider>
  );
}
