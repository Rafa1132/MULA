import type { Metadata } from "next";
import { MemoryPage } from "@/features/memory";
export const metadata: Metadata = { title: "Mula · Memory" };
export default function Page() { return <MemoryPage />; }
