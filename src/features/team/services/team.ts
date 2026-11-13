export type Agent = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  data: string;
  tools: string[];
  available_tools: Record<string, string>;
  revision: number;
};

export async function teamRequest(path: string, options?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...options });
  if (!response.ok) {
    let message = "Could not complete this request. Please try again.";
    if (response.status === 404) message = "Restart Mula with ./run.sh to load agent settings and forecasting.";
    if (response.status === 401) message = "Your session expired. Sign in again.";
    try {
      const body = await response.json();
      if (typeof body.detail === "string" && body.detail !== "Not Found") message = body.detail;
    } catch { /* A proxy may return HTML; keep the readable fallback above. */ }
    throw new Error(message);
  }
  return response.json();
}
