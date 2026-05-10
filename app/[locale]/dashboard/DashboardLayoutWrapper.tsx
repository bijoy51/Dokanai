import { DashboardShell } from "@/components/DashboardShell";
import type { Locale } from "@/lib/i18n/messages";

export default function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  return <DashboardShell locale={params.locale as Locale}>{children}</DashboardShell>;
}
