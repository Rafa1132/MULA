// The workspace page's calls: the account's projects. These are account-level (no project header).

export type Project = {
  id: string;
  name: string | null;
  // The name, or "Untitled project" until the owner names it.
  display_name: string;
  // One line about the business, set when the project is created (by hand or from a proposal).
  description: string | null;
  role: "owner" | "member";
  created_at: string;
};

export type Workspace = { id: string; name: string | null; projects: Project[]; max_projects: number };

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  if (response.ok) return response.json();
  let detail = fallback;
  try {
    const failure = await response.json();
    if (typeof failure.detail === "string") detail = failure.detail;
  } catch {
    // Not JSON (a proxy error page); the fallback says what failed.
  }
  const error = new Error(detail);
  (error as Error & { status?: number }).status = response.status;
  throw error;
}

export async function fetchWorkspace() {
  return readJson<Workspace>(await fetch("/api/workspace", { cache: "no-store" }), "Could not load your workspace.");
}

export async function createProject(name: string) {
  const response = await fetch("/api/projects", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
  });
  return readJson<Project>(response, "Could not create the project.");
}

export async function renameProject(id: string, name: string) {
  const response = await fetch(`/api/projects/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
  });
  return readJson<Project>(response, "Could not rename the project.");
}

export async function fetchProjects() {
  return readJson<Project[]>(await fetch("/api/projects", { cache: "no-store" }), "Could not load your projects.");
}
