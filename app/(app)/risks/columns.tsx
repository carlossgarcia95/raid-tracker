"use client";

import { ColumnDef } from "@tanstack/react-table";
import { api } from "@/convex/_generated/api";
import { FunctionReturnType } from "convex/server";
import { Badge } from "@/components/ui/badge";

type Risk = FunctionReturnType<typeof api.risks.list>[number];

export const columns: ColumnDef<Risk, unknown>[] = [
  { accessorKey: "title", header: "Title" },
  { accessorKey: "teamName", header: "Team" },
  { accessorKey: "probability", header: "P" },
  { accessorKey: "impact", header: "I" },
  {
    accessorKey: "score",
    header: "Score",
    cell: ({ row }) => {
      const s = row.original.score;
      return <span className={s >= 15 ? "font-semibold text-red-600" : ""}>{s}</span>;
    },
  },
  { accessorKey: "ownerName", header: "Owner", cell: ({ row }) => row.original.ownerName ?? "—" },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge> },
];
