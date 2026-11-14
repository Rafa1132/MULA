import type { Metadata } from "next";
import { Workspace } from "@/features/workspace";

export const metadata: Metadata = { title: "Chat · Mula" };

export default function Page() {
  return <Workspace />;
}
