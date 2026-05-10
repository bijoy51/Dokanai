"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n/messages";

export function LangSwitcher({ locale }: { locale: Locale }) {
  const pathname = usePathname() ?? "/en";
  const swap = (target: Locale) => {
    const parts = pathname.split("/");
    if (parts[1] === "en" || parts[1] === "bn") parts[1] = target;
    else parts.splice(1, 0, target);
    return parts.join("/") || `/${target}`;
  };

  return (
    <div className="inline-flex items-center rounded-md border border-slate-200 overflow-hidden text-xs">
      <Link
        href={swap("en")}
        className={`px-3 py-1.5 ${locale === "en" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
      >
        EN
      </Link>
      <Link
        href={swap("bn")}
        className={`px-3 py-1.5 ${locale === "bn" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
      >
        বাংলা
      </Link>
    </div>
  );
}
