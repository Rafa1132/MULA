import { OpenFirstProject } from "@/features/workspace";

// Pages now live inside a project (/projects/<id>/agents); old links open the first project's.
export default function Page() {
  return <OpenFirstProject path="/agents" />;
}
