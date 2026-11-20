import type { CatalogueEntry } from "../data.ts";
import { projectPath } from "../../../common/services/project.ts";

/**
 * Where an app's Open link goes, from its `launchUrl`: a path inside the project ("/apps/todo",
 * opened as /projects/<id>/apps/todo) or a full https URL for an external app. Anything else (a typo, "javascript:", "//host")
 * is refused with a warning, so a bad data entry can never become a dangerous link.
 */
export function launchUrl(entry: CatalogueEntry, projectId: string): string | undefined {
  const url = entry.launchUrl;
  if (url === undefined) return undefined;
  if (url.startsWith("/") && !url.startsWith("//")) return projectPath(projectId, url);
  try {
    if (new URL(url).protocol === "https:") return url;
  } catch {
    // Not a URL at all; reported below like any other refused value.
  }
  console.warn(`Catalogue entry ${entry.id} has a launchUrl that is not a Mula path or an https URL; Open is hidden.`);
  return undefined;
}
