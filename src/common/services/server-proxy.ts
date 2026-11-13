// Proxy only known application endpoints; credentials stay in HttpOnly cookies.
export async function proxyBackend(request: Request, path: string) {
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== request.headers.get("host")) {
          return Response.json({ detail: "Request origin is not allowed." }, { status: 403 });
        }
      } catch {
        return Response.json({ detail: "Request origin is not allowed." }, { status: 403 });
      }
    }
  }
  const backend = process.env.LARAS_BACKEND_URL || "http://127.0.0.1:8000";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Cookie: request.headers.get("cookie") || "",
  };
  const options: RequestInit = {
    method: request.method, headers, cache: "no-store", signal: request.signal,
  };
  if (request.method !== "GET") {
    if ((path === "/api/agents/operator/chat" || path.startsWith("/api/memory") || path.startsWith("/api/team") || path.startsWith("/api/forecasting")) && request.body) {
      // JSON can expand CSV characters into escapes; allow that overhead while
      // bounding the upload before buffering or forwarding it to the server.
      const reader = request.body.getReader();
      const decoder = new TextDecoder();
      let bytes = 0;
      let body = "";
      let maxBytes = 400_000;
      if (path.startsWith("/api/memory")) maxBytes = 64_000;
      if (path.startsWith("/api/team")) maxBytes = 100_000;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > maxBytes) {
            await reader.cancel();
            return Response.json({ detail: "This request is too large. Shorten the content or attach a smaller CSV (up to 50 KB)." }, { status: 413 });
          }
          body += decoder.decode(chunk.value, { stream: true });
        }
        options.body = body + decoder.decode();
      } finally { reader.releaseLock(); }
    } else options.body = await request.text();
  }
  try {
    const response = await fetch(`${backend.replace(/\/$/, "")}${path}`, options);
    const forwarded = new Headers({
      "Content-Type": response.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no",
    });
    for (const cookie of response.headers.getSetCookie()) forwarded.append("Set-Cookie", cookie);
    return new Response(response.body, { status: response.status, headers: forwarded });
  } catch {
    return Response.json({ detail: "Cannot reach LARAS. Start the backend on port 8000 and try again." }, { status: 503 });
  }
}
