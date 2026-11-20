import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { projectPath } from "@/common/services/project";
import { CatalogueDetailPage } from "@/features/catalogue";
import { findEntry } from "@/features/catalogue/services/details";
import { parentOf } from "@/features/catalogue/services/plugins";

type Params = { params: Promise<{ projectId: string; id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const entry = findEntry(id);
  if (entry === undefined) return { title: "Mula · Catalogue" };
  return { title: `Mula · ${entry.name}` };
}

export default async function Page({ params }: Params) {
  const { projectId, id } = await params;
  // Unknown ids get Next's 404 page instead of an empty detail page.
  const entry = findEntry(id);
  if (entry === undefined) notFound();
  // A plugin has no page of its own: send the visitor to its parent's plugins section.
  const parent = parentOf(entry);
  if (parent !== undefined) redirect(projectPath(projectId, `/catalogue/${parent.id}#plugins`));
  return <CatalogueDetailPage id={id} />;
}
