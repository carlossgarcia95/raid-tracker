"use client";

import { ColumnDef } from "@tanstack/react-table";
import { api } from "@/convex/_generated/api";
import { FunctionReturnType } from "convex/server";

type Dependency = FunctionReturnType<typeof api.dependencies.list>[number];

const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleDateString() : "—");
const ragColor: Record<string, string> = {
  green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-red-500",
};

export const columns: ColumnDef<Dependency, unknown>[] = [
  {
    accessorKey: "rag",
    header: "RAG",
    cell: ({ row }) => (
      <span className={`inline-block size-3 rounded-full ${ragColor[row.original.rag]}`} />
    ),
  },
  {
    id: "edge",
    header: "Dependency",
    cell: ({ row }) => (
      <span>
        {row.original.providerTitle}{" "}
        <span className="text-muted-foreground">→</span>{" "}
        {row.original.consumerTitle}
      </span>
    ),
  },
  { accessorKey: "neededByDate", header: "Needed by", cell: ({ row }) => fmt(row.original.neededByDate) },
  { accessorKey: "committedDate", header: "Committed", cell: ({ row }) => fmt(row.original.committedDate) },
  {
    accessorKey: "slackDays",
    header: "Slack (days)",
    cell: ({ row }) => {
      const s = row.original.slackDays;
      if (s === null) return <span className="text-muted-foreground">—</span>;
      return <span className={s < 0 ? "font-medium text-red-600" : ""}>{s}</span>;
    },
  },
];
