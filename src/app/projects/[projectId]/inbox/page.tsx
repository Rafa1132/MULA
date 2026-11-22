import type { Metadata } from "next";
import { InboxPage } from "@/features/inbox";
import { interTight } from "@/common/styles/fonts";

export const metadata: Metadata = { title: "Mula · Inbox" };

export default function Page() {
  return <div className={interTight.variable}><InboxPage /></div>;
}
