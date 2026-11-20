// The project a page belongs to comes from its URL, /projects/<id>/... . Calls to project data
// carry that id in the X-Mula-Project header; the Next.js proxy forwards it and the server checks,
// on every request, that the signed-in account may open the project. Each call names its own
// project, so two tabs on two projects never mix.
export const PROJECT_HEADER = "X-Mula-Project";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECT_PATH = /^\/projects\/([^/]+)/;

/** The project id in a path like /projects/<id>/memory, or null. */
export function projectIdFrom(pathname: string): string | null {
  const match = pathname.match(PROJECT_PATH);
  if (match === null || !UUID.test(match[1])) return null;
  return match[1];
}

export function isProjectId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** A page inside the project: projectPath(id, "/memory"), or projectPath(id) for its chat. */
export function projectPath(projectId: string, path = "") {
  if (path === "/") return `/projects/${projectId}`;
  return `/projects/${projectId}${path}`;
}

/** The project of the page this code runs on (browser only). */
export function currentProjectId(): string | null {
  if (typeof window === "undefined" || window.location === undefined) return null;
  return projectIdFrom(window.location.pathname);
}

/** fetch() for project data: adds the page's project to the request. Without one, the server answers 400. */
export function projectFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const projectId = currentProjectId();
  if (projectId !== null) headers.set(PROJECT_HEADER, projectId);
  return fetch(input, { ...init, headers });
}
