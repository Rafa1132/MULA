// A question one agent asked another; the owner approves it unless it was approved in advance.
export type AgentRequest = {
  id: string;
  from_agent: string;
  to_agent: string;
  to_name: string;
  question: string;
  status: "pending" | "running" | "answered" | "declined" | "failed" | "expired";
  answer: string | null;
  message_id: number | null;
  approved_in_advance: boolean;
};

export type ChatEvent = {
  type: "session" | "token" | "done" | "error" | "attachment" | "memory" | "request";
  session_id?: string;
  content?: string;
  detail?: string;
  note?: string;
  paths?: string[];
  truncated?: boolean;
  request?: AgentRequest;
};

export async function readChatStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatEvent) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let finished = false;

  function processLine(line: string) {
    if (!line.trim()) return;
    const event: ChatEvent = JSON.parse(line);
    if (event.type === "error") {
      throw new Error(
        event.detail || "The reply could not be completed. Try again.",
      );
    }
    if (event.type === "done") finished = true;
    onEvent(event);
  }

  try {
    while (!finished) {
      const result = await reader.read();
      if (result.done) break;
      // A network chunk can split a JSON line or even a multibyte character.
      pending += decoder.decode(result.value, { stream: true });
      let newline = pending.indexOf("\n");
      while (newline !== -1) {
        processLine(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf("\n");
      }
    }
    pending += decoder.decode();
    if (pending.trim()) processLine(pending);
    if (!finished) {
      throw new Error(
        "The connection ended before the reply finished. Please try again.",
      );
    }
  } finally {
    // Cancel also propagates Stop and interrupted reads through the proxy.
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
