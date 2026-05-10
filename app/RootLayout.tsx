import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DokanAI · AI Business Growth Assistant for SMEs",
  description: "Forecast demand, automate marketing, and grow sales. In Bangla, on a phone, offline-capable.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
