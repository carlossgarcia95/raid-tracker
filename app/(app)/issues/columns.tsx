"use client";

import { ColumnDef } from "@tanstack/react-table";
import { api } from "@/convex/_generated/api";
import { FunctionReturnType } from "convex/server";
import { Badge } from "@/components/ui/badge";

type Issue = FunctionReturnType<typeof api.issues.list>[number];

const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleDateString() : "—");
const sevVariant: Record<string, "outline" | "secondary" | "destructive"> = {
  low: "outline", medium: "secondary", high: "destructive", critical: "destructive",
};

export const columns: ColumnDef<Issue, unknown>[] = [
  { accessorKey: "title", header: "Title" },
  { accessorKey: "teamName", header: "Team" },
  {
    accessorKey: "severity",
    header: "Severity",
    cell: ({ row }) => <Badge variant={sevVariant[row.original.severity]}>{row.original.severity}</Badge>,
  },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant="outline">{row.original.status.replace("_", " ")}</Badge> },
  { accessorKey: "raisedDate", header: "Raised", cell: ({ row }) => fmt(row.original.raisedDate) },
];
