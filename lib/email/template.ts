/**
 * Per-recipient email template renderer.
 *
 * Builds a single mobile-friendly HTML email + a plain-text version from the
 * agent-drafted body. The body uses Mustache-lite merge tags ({{name}},
 * {{shop}}, {{coupon}}, {{expires}}) which are substituted per recipient
 * here. Unsubscribe footer + List-Unsubscribe URL are always appended for
 * Gmail/Yahoo bulk-sender compliance.
 *
 * The HTML is intentionally minimal: a centered card with the shop label,
 * the body, a single CTA button (if a CTA URL is provided), and a footer
 * with the unsubscribe link. No external CSS, no images, no JS — works in
 * every mail client including the Gmail clipper.
 */
import { makeUnsubToken } from "./unsub-token";

export interface RenderInput {
  /** Subject line as drafted, supports merge tags. */
  subject: string;
  /** Body as drafted (plain text with Mustache-lite tags). */
  body: string;
  /** Per-recipient values used to fill merge tags. */
  recipient: {
    accountEmail: string; // shop owner's account id
    customerId: string;
    name: string;
    email: string;
    locale: "en" | "bn";
  };
  /** The shop's display name (shown in greeting + footer). */
  shopName: string;
  /** Origin for unsubscribe links + future CTAs (e.g. "https://dokanai.vercel.app"). */
  origin: string;
  /** Optional extra merge values from the campaign (e.g. coupon). */
  extra?: Record<string, string>;
  /** Optional call-to-action (button) appended below the body. */
  cta?: { label: string; url: string };
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
}

function mergeTags(input: string, vars: Record<string, string>): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => {
    const v = vars[k];
    return v !== undefined ? v : `{{${k}}}`;
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphsToHtml(text: string): string {
  // Split on blank lines, escape each, preserve single newlines as <br>.
  return text
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 12px 0;line-height:1.55">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function renderCampaignEmail(input: RenderInput): RenderedEmail {
  const token = makeUnsubToken({
    account: input.recipient.accountEmail,
    customer: input.recipient.customerId,
  });
  const unsubscribeUrl = `${input.origin.replace(/\/+$/, "")}/${input.recipient.locale}/unsubscribe/${encodeURIComponent(token)}`;

  const baseVars: Record<string, string> = {
    name: input.recipient.name || (input.recipient.locale === "bn" ? "প্রিয় কাস্টমার" : "there"),
    shop: input.shopName,
    email: input.recipient.email,
    ...(input.extra ?? {}),
  };

  const subject = mergeTags(input.subject, baseVars).trim() || (input.recipient.locale === "bn" ? "আমাদের কাছ থেকে একটা বার্তা" : "A message from your shop");
  const bodyMerged = mergeTags(input.body, baseVars).trim();

  const footerText =
    input.recipient.locale === "bn"
      ? `আপনি এই ইমেলটি পাচ্ছেন কারণ আপনি ${input.shopName}-এর আপডেট পেতে সম্মতি দিয়েছিলেন। আর পেতে না চাইলে এখানে আনসাবস্ক্রাইব করুন:`
      : `You are receiving this because you opted in to updates from ${input.shopName}. To stop receiving these, unsubscribe here:`;

  const ctaHtml = input.cta
    ? `<p style="margin:18px 0 6px 0"><a href="${escapeHtml(input.cta.url)}" style="display:inline-block;background:#0f9d58;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(input.cta.label)}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="${input.recipient.locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
          <tr><td>
            <div style="font-size:13px;color:#64748b;margin-bottom:14px">${escapeHtml(input.shopName)}</div>
            ${paragraphsToHtml(bodyMerged)}
            ${ctaHtml}
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
            <div style="font-size:12px;color:#94a3b8;line-height:1.5">
              ${escapeHtml(footerText)}<br>
              <a href="${escapeHtml(unsubscribeUrl)}" style="color:#475569">${escapeHtml(unsubscribeUrl)}</a>
            </div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    bodyMerged,
    input.cta ? `\n${input.cta.label}: ${input.cta.url}` : "",
    "",
    "----",
    footerText,
    unsubscribeUrl,
  ]
    .join("\n")
    .trim();

  return { subject, html, text, unsubscribeUrl };
}
