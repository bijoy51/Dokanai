import { t, type Locale } from "@/lib/i18n/messages";

const styles: Record<string, string> = {
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rto: "bg-rose-50 text-rose-700 border-rose-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  cancelled: "bg-slate-50 text-slate-600 border-slate-200",
};

export function StatusPill({ status, locale }: { status: string; locale: Locale }) {
  const cls = styles[status] ?? styles.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${cls}`}>
      {t(`status.${status}`, locale)}
    </span>
  );
}
