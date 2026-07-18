"use client";

import { ColumnDef } from "@tanstack/react-table";
import { api } from "@/convex/_generated/api";
import { FunctionReturnType } from "convex/server";

type Team = FunctionReturnType<typeof api.teams.list>[number];

export const columns: ColumnDef<Team, unknown>[] = [
  {
    accessorKey: "name",
    header: "Team",
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-2">
        <span className="size-3 rounded-full" style={{ background: row.original.color }} />
        {row.original.name}
      </span>
    ),
  },
  { accessorKey: "leadName", header: "Lead", cell: ({ row }) => row.original.leadName ?? "—" },
  { accessorKey: "color", header: "Color" },
];
