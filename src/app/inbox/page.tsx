import { OpenFirstProject } from "@/features/workspace";

// Pages live inside a project (/projects/<id>/inbox); this address opens the first project's.
export default function Page() {
  return <OpenFirstProject path="/inbox" />;
}
