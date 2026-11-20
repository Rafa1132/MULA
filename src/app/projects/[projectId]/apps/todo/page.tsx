import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import { TodoPage } from "@/features/apps";

export const metadata: Metadata = { title: "Mula · To-do" };

// The To-do app's own display face, so it feels like a separate, printed object.
// Bundled at build time by next/font (like Geist in the root layout); no new package.
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-todo-serif", display: "swap" });

export default function Page() {
  return <div className={serif.variable}><TodoPage /></div>;
}
