"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type Preloaded, usePreloadedQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { layoutGraph } from "@/lib/graph-layout";
import { downstreamOf } from "@/lib/graph-traverse";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DeliverableNode, type DeliverableNodeType } from "./deliverable-node";
import { DependencyEdge, RAG_STROKE, type DependencyEdgeType } from "./dependency-edge";
import { GraphLegend } from "./graph-legend";
import { CycleBanner } from "./cycle-banner";
import { NodeInspectorPanel } from "./node-inspector-panel";
import { useNodesState, useEdgesState } from "@xyflow/react";

const nodeTypes: NodeTypes = { deliverable: DeliverableNode };
const edgeTypes: EdgeTypes = { dependency: DependencyEdge };

type GraphData = ReturnType<typeof usePreloadedQuery<typeof api.graph.get>>;
type DeliverableStatus = DeliverableNodeType["data"]["status"];
type Severity = "green" | "amber" | "red";

function GraphInner({ data }: { data: GraphData }) {
  const { setCenter, getNode } = useReactFlow();
  const setStatus = useMutation(api.deliverables.setStatus);
  const setRag = useMutation(api.dependencies.setRag);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nodeById = useMemo(
    () =>
      new Map<string, GraphData["nodes"][number]>(
        data.nodes.map((n) => [n.id, n]),
      ),
    [data.nodes],
  );
  const nodeTitleById = useMemo(
    () => new Map(data.nodes.map((n) => [n.id, n.title] as const)),
    [data.nodes],
  );
  const cycleMembers = useMemo(
    () => new Set(data.cycles.flatMap((c) => c.deliverableIds)),
    [data.cycles],
  );

  // Direct-neighbor highlight (one hop).
  const neighborIds = useMemo(() => {
    const s = new Set<string>();
    if (!selectedId) return s;
    for (const e of data.edges) {
      if (e.source === selectedId) s.add(e.target);
      if (e.target === selectedId) s.add(e.source);
    }
    return s;
  }, [selectedId, data.edges]);

  // Transitive downstream impact count for the inspector header.
  const impactCount = useMemo(() => {
    if (!selectedId) return 0;
    const down = downstreamOf(selectedId, data.edges);
    let n = 0;
    for (const id of down) {
      if (nodeById.get(id)?.effectiveRag !== "green") n++;
    }
    return n;
  }, [selectedId, data.edges, nodeById]);

  const toRow = useCallback(
    (edgeId: string, otherId: string, e: GraphData["edges"][number]) => {
      const o = nodeById.get(otherId)!;
      return {
        edgeId,
        id: o.id,
        title: o.title,
        teamName: o.teamName,
        effectiveRag: e.effectiveRag as Severity,
        rag: e.rag as Severity,
        reason: e.reasons[0],
        neededByDate: e.neededByDate,
        slackDays: e.slackDays,
      };
    },
    [nodeById],
  );

  const directUpstream = useMemo(
    () =>
      selectedId
        ? data.edges
            .filter((e) => e.target === selectedId)
            .map((e) => toRow(e.id, e.source, e))
        : [],
    [selectedId, data.edges, toRow],
  );
  const directDownstream = useMemo(
    () =>
      selectedId
        ? data.edges
            .filter((e) => e.source === selectedId)
            .map((e) => toRow(e.id, e.target, e))
        : [],
    [selectedId, data.edges, toRow],
  );

  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null;

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
          effectiveRag: n.effectiveRag,
          inCycle: cycleMembers.has(n.id),
          dimmed:
            selectedId !== null && n.id !== selectedId && !neighborIds.has(n.id),
        },
      })),
    );
  }, [data.nodes, positions, setNodes, selectedId, neighborIds, cycleMembers]);

  useEffect(() => {
    setEdges(
      data.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "dependency",
        markerEnd: { type: MarkerType.ArrowClosed, color: RAG_STROKE[e.effectiveRag] },
        data: {
          rag: e.rag,
          effectiveRag: e.effectiveRag,
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

  const focusCycle = useCallback(
    (ids: string[]) => {
      const pts = ids.map((id) => getNode(id)).filter((n): n is NonNullable<typeof n> => !!n);
      if (pts.length === 0) return;
      const cx = pts.reduce((s, n) => s + n.position.x, 0) / pts.length;
      const cy = pts.reduce((s, n) => s + n.position.y, 0) / pts.length;
      setCenter(cx, cy, { zoom: 1.2, duration: 600 });
    },
    [getNode, setCenter],
  );

  return (
    <>
      <CycleBanner cycles={data.cycles} nodeTitleById={nodeTitleById} onFocus={focusCycle} />
      <div className="relative h-[calc(100vh-12rem)] w-full rounded-md border">
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
            directUpstream={directUpstream}
            directDownstream={directDownstream}
            impactCount={impactCount}
            onSelect={setSelectedId}
            onSetStatus={(status: DeliverableStatus) =>
              setStatus({ id: selectedNode.id as Id<"deliverables">, status })
            }
            onSetRag={(edgeId, rag) =>
              setRag({ id: edgeId as Id<"dependencies">, rag })
            }
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </>
  );
}

export function DependencyGraph({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.graph.get>;
}) {
  const data = usePreloadedQuery(preloaded);

  if (data.nodes.length === 0) {
    return (
      <div className="flex h-[calc(100vh-12rem)] items-center justify-center rounded-md border text-sm text-muted-foreground">
        No deliverables in the active program yet.
      </div>
    );
  }

  return (
    <TooltipProvider delay={0}>
      <div className="space-y-3">
        <ReactFlowProvider>
          <GraphInner data={data} />
        </ReactFlowProvider>
      </div>
    </TooltipProvider>
  );
}
