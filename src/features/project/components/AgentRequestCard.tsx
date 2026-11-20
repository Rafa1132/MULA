import type { AgentRequest } from "@/features/operator";

const AGENT_NAMES: Record<string, string> = { operator: "Operator", forecasting: "Forecasting" };

function statusText(request: AgentRequest, caller: string) {
  const target = request.to_name;
  const texts: Record<AgentRequest["status"], string> = {
    pending: "",
    running: `${target} is working on it…`,
    answered: `${target} answered. ${caller}'s summary is below.`,
    declined: "You chose not to ask.",
    failed: `${target} could not answer. Ask ${caller} again when you're ready.`,
    expired: `This request expired. Ask ${caller} again.`,
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
      {request.status === "running" && <p className="agent-request-status" role="status"><span className="shimmer">{statusText(request, caller)}</span></p>}
      {request.status !== "pending" && request.status !== "running" && <p className="agent-request-status" role="status">{statusText(request, caller)}</p>}
    </div>
  );
}
