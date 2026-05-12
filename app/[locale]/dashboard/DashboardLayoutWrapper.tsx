import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { getSession } from "@/lib/auth";
import type { Locale } from "@/lib/i18n/messages";

export default function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const locale = params.locale as Locale;
  const session = getSession();
  if (!session) {
    redirect(`/${locale}/login?next=/${locale}/dashboard`);
  }
  return (
    <DashboardShell locale={locale} userName={session.name} userEmail={session.email}>
      {children}
    </DashboardShell>
  );
}
