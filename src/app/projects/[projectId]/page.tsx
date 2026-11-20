import type { Metadata } from "next";
import { ProjectChat } from "@/features/project";

export const metadata: Metadata = { title: "Chat · Mula" };

export default function Page() {
  return <ProjectChat />;
}
