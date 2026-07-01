import type { ReactNode } from "react";
import CountUp from "./CountUp";

export default function KpiCard({
  label,
  value,
  format,
  hint,
  visual,
}: {
  label: string;
  value: number;
  format: (v: number) => string;
  hint?: string;
  visual?: ReactNode;
}) {
  return (
    <div className="card-surface rounded-lg p-4 flex flex-col">
      <p className="text-xs text-text-secondary mb-1.5">{label}</p>
      <p className="text-2xl font-medium">
        <CountUp value={value} format={format} />
      </p>
      {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
      {visual && <div className="mt-3 flex-1 flex items-end">{visual}</div>}
    </div>
  );
}
