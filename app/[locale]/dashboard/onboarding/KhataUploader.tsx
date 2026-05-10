"use client";

import { useRef, useState } from "react";
import { UploadCloud, FileText, CheckCircle2 } from "lucide-react";
import { t, type Locale } from "@/lib/i18n/messages";
import { formatBDT } from "@/lib/utils";

interface Record {
  date: string;
  itemEn: string;
  itemBn: string;
  qty: number;
  amount: number;
}

export function KhataUploader({ locale }: { locale: Locale }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [records, setRecords] = useState<Record[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [imported, setImported] = useState(false);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setRecords(null);
    setImported(false);
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/khata", { method: "POST", body: fd });
    const data = await res.json();
    setRecords(data.records);
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className="rounded-lg border-2 border-dashed border-slate-300 hover:border-brand-500 hover:bg-brand-50/40 transition cursor-pointer p-10 text-center"
      >
        <UploadCloud className="w-10 h-10 mx-auto text-brand-600" />
        <div className="mt-3 font-medium">{t("ob.upload", locale)}</div>
        <button className="mt-3 inline-flex items-center px-3 py-1.5 rounded-md bg-brand-600 text-white text-sm">
          {t("ob.choose", locale)}
        </button>
        {fileName && (
          <div className="mt-3 text-xs text-slate-500 inline-flex items-center gap-1">
            <FileText className="w-3 h-3" /> {fileName}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,audio/*,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>

      <div className="text-xs text-slate-500">{t("ob.tip", locale)}</div>

      {loading && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          {t("ob.uploading", locale)}
        </div>
      )}

      {records && (
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium flex items-center justify-between">
            <span>{t("ob.preview", locale)} · {records.length}</span>
            <button
              onClick={() => setImported(true)}
              className="inline-flex items-center gap-1 bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-md text-xs"
            >
              <CheckCircle2 className="w-3 h-3" />
              {t("ob.import", locale)}
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">{t("ob.col.date", locale)}</th>
                <th className="text-left px-4 py-2">{t("ob.col.item", locale)}</th>
                <th className="text-right px-4 py-2">{t("ob.col.qty", locale)}</th>
                <th className="text-right px-4 py-2">{t("ob.col.amount", locale)}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-500">{r.date}</td>
                  <td className="px-4 py-2">{locale === "bn" ? r.itemBn : r.itemEn}</td>
                  <td className="px-4 py-2 text-right">{r.qty}</td>
                  <td className="px-4 py-2 text-right">{formatBDT(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {imported && (
            <div className="px-4 py-3 border-t border-slate-200 text-sm text-brand-700 bg-brand-50">
              ✓ {t("ob.imported", locale)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
