"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, MapPin, Store, AlertCircle, Pencil } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";
import { VENUE_TYPE_LABELS } from "@/lib/ai/location-demand";
import type { ShopProfile, VenueType } from "@/lib/data/shop-profile";

/**
 * Editable shop-profile card. Owns its own form state and persists via
 * /api/shop-profile. Lives at the top of the Khata-to-Cloud onboarding
 * page so the shopkeeper sees it regardless of which import tab they
 * pick. The profile is location-only — shop type is auto-detected from
 * the imported catalog (see detectShopType in lib/ai/location-demand.ts).
 */
export function ShopProfileCard({ locale }: { locale: Locale }) {
  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // form state
  const [venueType, setVenueType] = useState<VenueType | "">("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const res = await fetch("/api/shop-profile");
        const data = await res.json();
        if (dead) return;
        if (data.profile) {
          const p = data.profile as ShopProfile;
          setProfile(p);
          setVenueType(p.venueType);
          setCity(p.city ?? "");
          setArea(p.area ?? "");
          setEditing(false);
        } else {
          setEditing(true);
        }
      } catch {
        setError(t("shopProfile.errLoad", locale));
      } finally {
        if (!dead) setLoading(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [locale]);

  const save = async () => {
    setError("");
    setSaved(false);
    if (!venueType) {
      setError(t("shopProfile.errRequired", locale));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/shop-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueType, city, area }),
      });
      const data = await res.json();
      if (!res.ok || !data.profile) {
        setError(data.error || t("shopProfile.errSave", locale));
        return;
      }
      setProfile(data.profile);
      setEditing(false);
      setSaved(true);
    } catch {
      setError(t("shopProfile.errSave", locale));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("common.loading", locale)}
      </div>
    );
  }

  // ---------- Read-only summary view ----------
  if (!editing && profile) {
    return (
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-brand-700">
              <Store className="w-3.5 h-3.5" /> {t("shopProfile.title", locale)}
            </div>
            <div className="mt-1 text-base font-semibold text-brand-900">
              {VENUE_TYPE_LABELS[profile.venueType][locale]}
            </div>
            <div className="mt-0.5 text-xs text-brand-900/80 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {[profile.area, profile.city].filter(Boolean).join(", ") ||
                t("shopProfile.noLocation", locale)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-brand-300 bg-white text-brand-800 hover:bg-brand-100 shrink-0"
          >
            <Pencil className="w-3 h-3" /> {t("shopProfile.edit", locale)}
          </button>
        </div>
        {saved && (
          <div className="mt-3 inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Check className="w-3 h-3" /> {t("shopProfile.saved", locale)}
          </div>
        )}
      </div>
    );
  }

  // ---------- Edit / first-time form ----------
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-1">
        <Store className="w-4 h-4 text-brand-600" />
        <h3 className="text-sm font-semibold">{t("shopProfile.title", locale)}</h3>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        {t("shopProfile.subtitle", locale)}
      </p>

      <div className="grid grid-cols-1 gap-3 mb-3">
        <div>
          <label className="text-xs text-slate-500">{t("shopProfile.venueType", locale)}</label>
          <select
            value={venueType}
            onChange={(e) => setVenueType(e.target.value as VenueType)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">{t("shopProfile.choose", locale)}</option>
            {(Object.keys(VENUE_TYPE_LABELS) as VenueType[]).map((k) => (
              <option key={k} value={k}>
                {VENUE_TYPE_LABELS[k][locale]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-xs text-slate-500">{t("shopProfile.city", locale)}</label>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t("shopProfile.cityPlaceholder", locale)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">{t("shopProfile.area", locale)}</label>
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder={t("shopProfile.areaPlaceholder", locale)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {error && (
        <div className="mb-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving || !venueType}
          className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {t("shopProfile.save", locale)}
        </button>
        {profile && (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setVenueType(profile.venueType);
              setCity(profile.city);
              setArea(profile.area);
              setError("");
            }}
            className="inline-flex items-center gap-1 text-sm px-3 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            {t("shopProfile.cancel", locale)}
          </button>
        )}
      </div>
    </div>
  );
}
