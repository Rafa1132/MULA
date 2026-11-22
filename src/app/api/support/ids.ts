// Knowledge entries, tickets and conversations have server ids of 32 hex characters (uuid4().hex).
// Checked here so a malformed id never builds a backend URL.
export const RECORD_ID = /^[0-9a-f]{32}$/;

export function recordNotFound(what: string) {
  return Response.json({ detail: `That ${what} wasn't found.` }, { status: 404 });
}
