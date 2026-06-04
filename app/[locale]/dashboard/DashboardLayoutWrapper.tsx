import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { getSession } from "@/lib/auth";
import { hydrateImported } from "@/lib/data/imported";
import { hydrateShopProfile } from "@/lib/data/shop-profile";
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
  // Warm this instance's in-memory caches from the durable KV before any child
  // page reads them synchronously. This is what makes imported data and the
  // shop profile survive Vercel's per-instance statelessness.
  console.log("[layout] hydrate imported + profile for", session.email);
  await Promise.all([
    hydrateImported(session.email),
    hydrateShopProfile(session.email),
  ]);
  return (
    <DashboardShell locale={locale} userName={session.name} userEmail={session.email}>
      {children}
    </DashboardShell>
  );
}
