import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistration } from "./ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "DokanAI · AI Business Growth Assistant for SMEs",
  description:
    "Forecast demand, automate marketing, and grow sales. In Bangla, on a phone, offline-capable.",
  applicationName: "DokanAI",
  // PWA: links the manifest so Chrome/Edge/Safari treat the site as
  // installable. Theme + Apple-specific meta below complete the picture.
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DokanAI",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#16a34a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Mounted once at the root so the service worker registers exactly
            once across the whole app — no matter which page first loads. */}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
