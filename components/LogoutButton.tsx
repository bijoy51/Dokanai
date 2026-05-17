"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";

export function LogoutButton({ locale }: { locale: Locale }) {
  const [loading, setLoading] = useState(false);
  const logout = async () => {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Drop any cached per-account state so the next user starts clean.
      try {
        sessionStorage.removeItem("dokanai:analyze:v1");
      } catch {
        /* storage unavailable — non-fatal */
      }
      window.location.assign(`/${locale}`);
    }
  };
  return (
    <button
      onClick={logout}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      <LogOut className="w-3.5 h-3.5" />
      {t("auth.logout", locale)}
    </button>
  );
}
