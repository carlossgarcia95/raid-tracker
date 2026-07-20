// Shared RAG (Red/Amber/Green) presentation tokens. Colors match the graph's
// edge/marker strokes so the graph and dashboard read as one system.
export type Severity = "green" | "amber" | "red";

export const RAG_STROKE: Record<Severity, string> = {
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
};

export const RAG_LABEL: Record<Severity, string> = {
  green: "On track",
  amber: "At risk",
  red: "Critical",
};

// Tailwind background classes for RAG dots/pills (theme-aware via the palette).
export const RAG_DOT: Record<Severity, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

export const RAG_ORDER: Record<Severity, number> = { green: 0, amber: 1, red: 2 };
