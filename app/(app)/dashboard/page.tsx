import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default async function DashboardPage() {
  const preloaded = await preloadQuery(api.dashboard.get, {});
  return <DashboardView preloaded={preloaded} />;
}
