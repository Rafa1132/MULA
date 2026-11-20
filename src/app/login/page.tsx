import type { Metadata } from "next";
import { AccountPage } from "@/features/landing";

export const metadata: Metadata = { title: "Log in · Mula" };

export default function Page() {
  return <AccountPage mode="login" />;
}
