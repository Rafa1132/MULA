import type { Metadata } from "next";
import { AccountPage } from "@/features/landing";

export const metadata: Metadata = { title: "Get started · Mula" };

export default function Page() {
  return <AccountPage mode="register" />;
}
