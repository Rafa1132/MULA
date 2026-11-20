import type { Metadata } from "next";
import { SettingsPage } from "@/features/orchestrator";

export const metadata: Metadata = { title: "Settings · Mula" };

export default function Page() {
  return <SettingsPage />;
}
