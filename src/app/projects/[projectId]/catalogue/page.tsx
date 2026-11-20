import type { Metadata } from "next";
import { CataloguePage } from "@/features/catalogue";

export const metadata: Metadata = { title: "Mula · Catalogue" };

export default function Page() {
  return <CataloguePage />;
}
