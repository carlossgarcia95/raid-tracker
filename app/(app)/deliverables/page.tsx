import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/components/data-table";
import { columns } from "./columns";

export default async function DeliverablesPage() {
  const preloaded = await preloadQuery(api.deliverables.list, {});
  const data = preloadedQueryResult(preloaded);
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Deliverables</h1>
      <DataTable columns={columns} data={data} />
    </section>
  );
}
