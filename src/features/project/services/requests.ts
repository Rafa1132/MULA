import type { AgentRequest } from "@/features/operator";

type WithRequests = { id: string; requests?: AgentRequest[] };

// Replace a request wherever it is shown, or add it under the message that made it.
export function placeRequest<T extends WithRequests>(messages: T[], messageId: string, request: AgentRequest): T[] {
  const shown = messages.some((message) => message.requests?.some((item) => item.id === request.id));
  return messages.map((message) => {
    const requests = message.requests ?? [];
    if (shown && requests.some((item) => item.id === request.id)) {
      return { ...message, requests: requests.map((item) => {
        if (item.id === request.id) return request;
        return item;
      }) };
    }
    if (!shown && message.id === messageId) return { ...message, requests: [...requests, request] };
    return message;
  });
}

// Saved messages use their database id; requests whose message is gone are not shown.
export function attachRequests<T extends WithRequests>(messages: T[], requests: AgentRequest[]): T[] {
  let placed = messages;
  for (const request of requests) {
    if (request.message_id !== null) placed = placeRequest(placed, String(request.message_id), request);
  }
  return placed;
}
