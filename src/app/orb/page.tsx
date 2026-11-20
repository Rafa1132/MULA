import { OrbDemo } from "@/features/orb";
import "@/features/orb/orb.css";

export const metadata = { title: "Agent orb · Mula" };

// A demo of the agent orb. It needs no account and no backend.
export default function Page() {
  return <OrbDemo />;
}
