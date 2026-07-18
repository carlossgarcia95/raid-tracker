import { preloadQuery, preloadedQueryResult } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/components/data-table";
import { columns } from "./columns";

export default async function DependenciesPage() {
  const preloaded = await preloadQuery(api.dependencies.list, {});
  const data = preloadedQueryResult(preloaded);
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Dependencies</h1>
      <DataTable columns={columns} data={data} />
    </section>
  );
}
