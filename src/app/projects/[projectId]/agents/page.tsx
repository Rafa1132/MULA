import type { Metadata } from "next";
import { TeamPage } from "@/features/team";
import { interTight } from "@/common/styles/fonts";

export const metadata: Metadata = { title: "Mula · My agents" };

// The font class makes Inter Tight available to the agent list and the Add agent form (team.css).
export default function Page() {
  return <div className={interTight.variable}><TeamPage /></div>;
}
