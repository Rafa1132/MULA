import type { AgentRequest } from "@/features/operator";

const AGENT_NAMES: Record<string, string> = { operator: "Operator", forecasting: "Forecasting" };

function statusText(request: AgentRequest) {
  const target = request.to_name;
  const texts: Record<AgentRequest["status"], string> = {
    pending: "",
    running: `${target} is working on it…`,
    answered: `${target} answered. The Operator's summary is below.`,
    declined: "You chose not to ask.",
    failed: `${target} could not answer. Ask the Operator again when you're ready.`,
    expired: "This request expired. Ask the Operator again.",
  };
  return texts[request.status];
}

export default function AgentRequestCard({ request, disabled, onApprove, onDecline }: {
  request: AgentRequest;
  disabled: boolean;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  const caller = AGENT_NAMES[request.from_agent] ?? request.from_agent;
  return (
    <div className="agent-request" role="group" aria-label={`${caller} request to ${request.to_name}`}>
      <p className="agent-request-title">{caller} wants to ask {request.to_name}</p>
      <blockquote>{request.question}</blockquote>
      {request.status === "pending" && <div className="agent-request-actions">
        <button type="button" onClick={() => onApprove(request.id)} disabled={disabled}>Ask {request.to_name}</button>
        <button type="button" className="text-button" onClick={() => onDecline(request.id)} disabled={disabled}>Not now</button>
      </div>}
      {request.status !== "pending" && <p className="agent-request-status" role="status">{statusText(request)}</p>}
    </div>
  );
}
