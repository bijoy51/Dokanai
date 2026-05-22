import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { getSession } from "@/lib/auth";
import { hydrateImported } from "@/lib/data/imported";
import type { Locale } from "@/lib/i18n/messages";

export default async function DashboardLayout({
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
  // Warm this instance's in-memory store from the durable KV before any child
  // page reads it synchronously via getStore()/isShopEmpty(). This is what
  // makes imported data survive Vercel's per-instance statelessness.
  console.log("[layout] hydrateImported for", session.email);
  await hydrateImported(session.email);
  return (
    <DashboardShell locale={locale} userName={session.name} userEmail={session.email}>
      {children}
    </DashboardShell>
  );
}
