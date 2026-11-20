import { OpenFirstProject } from "@/features/workspace";

type Params = { params: Promise<{ id: string }> };

// Pages now live inside a project (/projects/<id>/catalogue/<entry>); old links open the first project's.
export default async function Page({ params }: Params) {
  const { id } = await params;
  return <OpenFirstProject path={`/catalogue/${encodeURIComponent(id)}`} />;
}
