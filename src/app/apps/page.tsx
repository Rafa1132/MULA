import type { Metadata } from "next";
import { AppsPage } from "@/features/apps";

export const metadata: Metadata = { title: "Mula · My apps" };

export default function Page() {
  return <AppsPage />;
}
