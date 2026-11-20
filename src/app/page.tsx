import type { Metadata } from "next";
import { Landing } from "@/features/landing";

export const metadata: Metadata = { title: "Mula: a little clarity for your everyday operations" };

export default function Page() {
  return <Landing />;
}
