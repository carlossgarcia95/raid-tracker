"use client";

import { useState } from "react";
import { Preloaded, usePreloadedQuery, useMutation } from "convex/react";
import ReactMarkdown from "react-markdown";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PROSE =
  "max-w-none rounded-lg border p-6 text-sm " +
  "[&_h1]:mb-1 [&_h1]:text-lg [&_h1]:font-semibold " +
  "[&_h2]:mt-4 [&_h2]:mb-1 [&_h2]:font-semibold " +
  "[&_h3]:mt-3 [&_h3]:font-medium [&_h3]:text-muted-foreground " +
  "[&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1 " +
  "[&_p]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5";

export function DigestView({
  latest,
  all,
}: {
  latest: Preloaded<typeof api.digests.getLatest>;
  all: Preloaded<typeof api.digests.list>;
}) {
  const latestDigest = usePreloadedQuery(latest);
  const digests = usePreloadedQuery(all);
  const generate = useMutation(api.digests.generateNow);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected =
    (selectedKey ? digests.find((d) => d.weekKey === selectedKey) : null) ?? latestDigest;

  const onGenerate = async () => {
    setBusy(true);
    try {
      await generate({});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Weekly Digest</h1>
        <Button onClick={onGenerate} disabled={busy}>
          {busy ? "Generating…" : "Generate now"}
        </Button>
      </div>

      {digests.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {digests.map((d) => (
            <button
              key={d.weekKey}
              onClick={() => setSelectedKey(d.weekKey)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs",
                selected?.weekKey === d.weekKey && "bg-accent font-medium",
              )}
            >
              {d.weekKey}
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <article className={PROSE}>
          <ReactMarkdown>{selected.markdown}</ReactMarkdown>
        </article>
      ) : (
        <p className="text-sm text-muted-foreground">
          No digest yet. Click <strong>Generate now</strong> to create this week’s digest.
        </p>
      )}
    </div>
  );
}
