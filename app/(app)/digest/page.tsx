import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { DigestView } from "@/components/digest/digest-view";

export default async function DigestPage() {
  const [latest, all] = await Promise.all([
    preloadQuery(api.digests.getLatest, {}),
    preloadQuery(api.digests.list, {}),
  ]);
  return <DigestView latest={latest} all={all} />;
}
