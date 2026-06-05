import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { extractFromImages, extractFromPdf } from "@/lib/import/extract";

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
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Attach a PDF file." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `PDF is ${(file.size / 1_000_000).toFixed(1)} MB. Limit is ${(MAX_BYTES / 1_000_000).toFixed(1)} MB.` },
        { status: 413 },
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const out = await extractFromPdf(bytes);
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Extraction failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
