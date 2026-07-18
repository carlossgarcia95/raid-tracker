"use client";

import { ColumnDef } from "@tanstack/react-table";
import { api } from "@/convex/_generated/api";
import { FunctionReturnType } from "convex/server";
import { Badge } from "@/components/ui/badge";

type Deliverable = FunctionReturnType<typeof api.deliverables.list>[number];

const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleDateString() : "—");

export const columns: ColumnDef<Deliverable, unknown>[] = [
  { accessorKey: "title", header: "Title" },
  {
    accessorKey: "teamName",
    header: "Team",
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: row.original.teamColor }} />
        {row.original.teamName}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <Badge variant="outline">{row.original.status.replace("_", " ")}</Badge>,
  },
  { accessorKey: "targetDate", header: "Target", cell: ({ row }) => fmt(row.original.targetDate) },
];
