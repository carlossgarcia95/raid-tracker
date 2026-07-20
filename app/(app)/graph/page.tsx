import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { DependencyGraph } from "@/components/graph/dependency-graph";

export default async function GraphPage() {
  const preloaded = await preloadQuery(api.graph.get, {});
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Dependency Graph</h1>
      <DependencyGraph preloaded={preloaded} />
    </section>
  );
}
