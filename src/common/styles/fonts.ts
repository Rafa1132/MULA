import { Inter_Tight } from "next/font/google";

// The brand's UI face, used by the Inventory page and the agent list and form in My agents. Bundled at
// build time by next/font (like Geist in app/layout.tsx), so nothing is fetched from Google at runtime.
// Pages that use it wrap their content in an element with this class and read var(--font-ui).
export const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
