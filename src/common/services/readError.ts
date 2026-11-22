// The readable message for a failed API call: the server's own `detail` when it sent one, else the
// caller's fallback. Shared by the knowledge base and inbox pages.

export async function readError(response: Response, fallback: string): Promise<string> {
  if (response.status === 401) return "Your session expired. Sign in again.";
  try {
    const body = await response.json();
    if (typeof body.detail === "string" && body.detail !== "Not Found") return body.detail;
    // A 422 from FastAPI lists the fields; their messages never include the submitted values.
    if (Array.isArray(body.detail) && body.detail.length > 0 && typeof body.detail[0].msg === "string") {
      return body.detail[0].msg.replace(/^Value error, /, "");
    }
  } catch {
    // A proxy may answer with HTML; keep the fallback.
  }
  return fallback;
}
