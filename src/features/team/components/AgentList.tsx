import AgentAvatar from "./AgentAvatar";
import type { AgentCardData } from "../services/agentCards";

type Props = { cards: AgentCardData[]; onOpen: (card: AgentCardData) => void };

/** The agents as a grid of cards: mascot, name, status dot and short role. Each card opens its detail. */
export default function AgentList({ cards, onOpen }: Props) {
  if (cards.length === 0) return <p className="agent-list-empty">No agents yet. Use Add agent to create the first one.</p>;
  return <ul className="agent-list" aria-label="Agents">
    {cards.map((card) => <li key={`${card.kind}-${card.id}`}>
      <button type="button" className="agent-list-card" onClick={() => onOpen(card)}>
        <span className="agent-tile small"><AgentAvatar id={card.id} name={card.name} size={40} /></span>
        <span className="agent-list-text">
          <strong>{card.name}</strong>
          <span className="agent-list-role">{card.role}</span>
          <span className="agent-list-status" data-state={card.status.state}><span className="agent-list-dot" aria-hidden="true" />{card.status.text}</span>
          {card.warning && <span className="agent-warning-badge">{card.warning}</span>}
        </span>
      </button>
    </li>)}
  </ul>;
}
