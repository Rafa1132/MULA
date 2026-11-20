import type { Metadata } from "next";
import { WorkspacePage } from "@/features/workspace";

export const metadata: Metadata = { title: "Workspace · Mula" };

export default function Page() {
  return <WorkspacePage />;
}
