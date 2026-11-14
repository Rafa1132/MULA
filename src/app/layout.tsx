import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "@/common/styles/globals.css";

// Bundled at build time by next/font, so the page looks the same on every machine.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });

export const metadata: Metadata = {
  title: "Mula",
  description: "A little clarity for your everyday operations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={geist.variable}>
      <body>{children}</body>
    </html>
  );
}
