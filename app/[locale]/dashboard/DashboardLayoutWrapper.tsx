import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { DataSyncGuard } from "@/components/DataSyncGuard";
import { getSession } from "@/lib/auth";
import { hydrateImported } from "@/lib/data/imported";
import { hydrateShopProfile } from "@/lib/data/shop-profile";
import { hydrateUploadHistory } from "@/lib/data/upload-history";
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
  // page reads them synchronously. The hydrate functions are no-ops when the
  // data is already in the per-instance Map, so refresh-heavy users only pay
  // the KV cost once per cold-start per account. Concurrent first-renders
  // share a single fetch via the inFlight dedupe inside each hydrate.
  await Promise.all([
    hydrateImported(session.email),
    hydrateShopProfile(session.email),
    hydrateUploadHistory(session.email),
  ]);
  return (
    <DashboardShell locale={locale} userName={session.name} userEmail={session.email}>
      {/* Proactive self-heal: if the ML backend's in-memory KV has been
          wiped (sleep / restart) but the browser still holds a mirror,
          DataSyncGuard re-POSTs it silently and reloads. Renders nothing. */}
      <DataSyncGuard userEmail={session.email} />
      {children}
    </DashboardShell>
  );
}
