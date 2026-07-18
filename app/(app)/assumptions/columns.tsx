"use client";

import { ColumnDef } from "@tanstack/react-table";
import { api } from "@/convex/_generated/api";
import { FunctionReturnType } from "convex/server";
import { Badge } from "@/components/ui/badge";

type Assumption = FunctionReturnType<typeof api.assumptions.list>[number];

const fmt = (ms?: number) => (ms ? new Date(ms).toLocaleDateString() : "—");

export const columns: ColumnDef<Assumption, unknown>[] = [
  { accessorKey: "title", header: "Title" },
  {
    accessorKey: "validationStatus",
    header: "Validation",
    cell: ({ row }) => <Badge variant="outline">{row.original.validationStatus}</Badge>,
  },
  { accessorKey: "validateByDate", header: "Validate by", cell: ({ row }) => fmt(row.original.validateByDate) },
  { accessorKey: "ownerName", header: "Owner", cell: ({ row }) => row.original.ownerName ?? "—" },
];
