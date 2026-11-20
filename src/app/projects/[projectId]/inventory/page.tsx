import type { Metadata } from "next";
import { InventoryPage } from "@/features/inventory";
import { interTight } from "@/common/styles/fonts";

export const metadata: Metadata = { title: "Mula · Inventory" };

export default function Page() {
  return <div className={interTight.variable}><InventoryPage /></div>;
}
