import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  hint,
  trend,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  trend?: number;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-slate-200 bg-white p-4", className)}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500 flex items-center gap-2">
        {typeof trend === "number" && (
          <span className={trend >= 0 ? "text-brand-600" : "text-rose-600"}>
            {trend >= 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
}
