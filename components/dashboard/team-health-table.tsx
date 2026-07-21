import { type FunctionReturnType } from "convex/server";
import { type api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RAG_DOT, RAG_LABEL } from "@/lib/rag";
import { cn } from "@/lib/utils";

type Dashboard = FunctionReturnType<typeof api.dashboard.get>;

export function TeamHealthTable({ teams }: { teams: Dashboard["teams"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Per-team health</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team</TableHead>
              <TableHead>Health</TableHead>
              <TableHead className="text-right">R / A / G</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((t) => (
              <TableRow key={t.teamId}>
                <TableCell className="flex items-center gap-2 font-medium">
                  <span className="size-2.5 rounded-full" style={{ background: t.color }} />
                  {t.name}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("size-2 rounded-full", RAG_DOT[t.rag])} />
                    {RAG_LABEL[t.rag]}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {t.counts.red} / {t.counts.amber} / {t.counts.green}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
