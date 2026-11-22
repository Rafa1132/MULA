import type { Metadata } from "next";
import { KnowledgePage } from "@/features/knowledge";
import { interTight } from "@/common/styles/fonts";

export const metadata: Metadata = { title: "Mula · Knowledge base" };

export default function Page() {
  return <div className={interTight.variable}><KnowledgePage /></div>;
}
