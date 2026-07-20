import { HugeiconsIcon } from "@hugeicons/react";
import { Alert01Icon } from "@hugeicons/core-free-icons";

type Cycle = { deliverableIds: string[]; edgeIds: string[] };

export function CycleBanner({
  cycles,
  nodeTitleById,
  onFocus,
}: {
  cycles: Cycle[];
  nodeTitleById: Map<string, string>;
  onFocus: (deliverableIds: string[]) => void;
}) {
  if (cycles.length === 0) return null;
  const label = (id: string) => nodeTitleById.get(id) ?? "—";

  return (
    <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-red-600">
        <HugeiconsIcon icon={Alert01Icon} strokeWidth={2} className="size-4" />
        {cycles.length === 1
          ? "1 circular dependency detected"
          : `${cycles.length} circular dependencies detected`}
      </div>
      <ul className="mt-1 space-y-0.5">
        {cycles.map((c, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onFocus(c.deliverableIds)}
              className="text-left text-muted-foreground underline-offset-2 hover:underline"
            >
              {[...c.deliverableIds, c.deliverableIds[0]].map(label).join(" → ")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
