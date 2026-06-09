import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { extractFromImages, extractFromMultiplePdfs, extractFromPdf } from "@/lib/import/extract";

/**
 * POST /api/import/extract
 *   multipart/form-data:
 *     mode = "photos" | "pdf"
 *     files[] (mode=photos) OR file (mode=pdf)
 *
 *   -> { products: [...], sales: [...], notes: string }
 *
 * Returns the same canonical shape that lib/data/imported.ts.buildDataset
 * accepts, so the client just hands the result to the existing
 * POST /api/import (with `useExtracted: true`) to commit it.
 *
 * This endpoint ONLY extracts — it does NOT write anything to the user's
 * store. The two-step flow lets the user preview the row count before
 * replacing their shop data, and lets us reject the upload cleanly if
 * the model returns garbage.
 */

// Hard upper bound on combined upload size. Vercel serverless caps body
// at ~4.5 MB; we cap below that to leave headroom for the multipart
// envelope. Caller should compress / downscale photos client-side first.
const MAX_BYTES = 4_000_000;
const MAX_PHOTOS = 8;

export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body." }, { status: 400 });
  }

  const mode = String(form.get("mode") ?? "").toLowerCase();
  if (mode !== "photos" && mode !== "pdf") {
    return NextResponse.json({ error: "mode must be 'photos' or 'pdf'." }, { status: 400 });
  }

  try {
    if (mode === "photos") {
      const files = form.getAll("files").filter((v): v is File => v instanceof File);
      if (files.length === 0) {
        return NextResponse.json({ error: "Attach at least one image." }, { status: 400 });
      }
      if (files.length > MAX_PHOTOS) {
        return NextResponse.json(
          { error: `Too many photos. Max ${MAX_PHOTOS} per upload.` },
          { status: 413 },
        );
      }
      const total = files.reduce((s, f) => s + f.size, 0);
      if (total > MAX_BYTES) {
        return NextResponse.json(
          { error: `Combined photo size is ${(total / 1_000_000).toFixed(1)} MB. Limit is ${(MAX_BYTES / 1_000_000).toFixed(1)} MB. Compress or downscale and retry.` },
          { status: 413 },
        );
      }
      const images = await Promise.all(
        files.map(async (f) => ({
          mime: f.type || "image/jpeg",
          bytes: new Uint8Array(await f.arrayBuffer()),
        })),
      );
      const out = await extractFromImages(images);
      return NextResponse.json(out);
    }

    // mode === "pdf"
    // Accept three shapes (backwards-compatible):
    //   1) `file`                       — legacy single-PDF path
    //   2) `productsFile`               — new dual-upload, only products
    //   3) `salesFile`                  — new dual-upload, only sales
    //   4) `productsFile`+`salesFile`   — new dual-upload, both
    // The dual path passes both PDFs to the model in a single call so it
    // can de-duplicate product names referenced across the two files.
    const legacy = form.get("file");
    const productsFile = form.get("productsFile");
    const salesFile = form.get("salesFile");

    const collected: Array<{ label: string; file: File }> = [];
    if (productsFile instanceof File && productsFile.size > 0) {
      collected.push({ label: "PRODUCTS PDF (hinted by user)", file: productsFile });
    }
    if (salesFile instanceof File && salesFile.size > 0) {
      collected.push({ label: "SALES PDF (hinted by user)", file: salesFile });
    }
    if (legacy instanceof File && legacy.size > 0 && collected.length === 0) {
      collected.push({ label: "PDF", file: legacy });
    }

    if (collected.length === 0) {
      return NextResponse.json({ error: "Attach at least one PDF file." }, { status: 400 });
    }

    const combined = collected.reduce((s, c) => s + c.file.size, 0);
    if (combined > MAX_BYTES) {
      return NextResponse.json(
        { error: `Combined PDF size is ${(combined / 1_000_000).toFixed(1)} MB. Limit is ${(MAX_BYTES / 1_000_000).toFixed(1)} MB.` },
        { status: 413 },
      );
    }

    if (collected.length === 1) {
      // Single PDF — use the existing path; identical behaviour to before.
      const bytes = new Uint8Array(await collected[0].file.arrayBuffer());
      const out = await extractFromPdf(bytes);
      return NextResponse.json(out);
    }

    const sources = await Promise.all(
      collected.map(async (c) => ({
        label: c.label,
        bytes: new Uint8Array(await c.file.arrayBuffer()),
      })),
    );
    const out = await extractFromMultiplePdfs(sources);
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Extraction failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
