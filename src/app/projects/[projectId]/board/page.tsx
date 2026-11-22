import type { Metadata } from "next";
import { BoardPage } from "@/features/board";
import { interTight } from "@/common/styles/fonts";

export const metadata: Metadata = { title: "Mula · Board" };

export default function Page() {
  return <div className={interTight.variable}><BoardPage /></div>;
}
