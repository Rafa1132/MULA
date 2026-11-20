"use client";

// An agent's character (services/avatar.ts): the orchestrator is the voice orb from features/orb
// (OrchestratorOrb); other agents are bubble bots, self-contained animated SVGs in public/agents/ shown
// as images so their embedded styles can't reach the page; an agent without art shows its initial.
import { OrchestratorOrb } from "@/features/orb";
import { characterFor } from "../services/avatar";

// The orb is drawn for 32 px and up.
const MIN_ORB = 32;

export default function AgentAvatar({ id, name, size = 104 }: { id: string; name: string; size?: number }) {
  const character = characterFor(id, name);
  if (character.kind === "orb") {
    return <span className="agent-avatar" role="img" aria-label={`${name} character`} style={{ width: size, height: size }}>
      <OrchestratorOrb size={Math.max(MIN_ORB, size)} />
    </span>;
  }
  if (character.kind === "bot") {
    // Not draggable on its own: pressing the mascot must move the whole card on the map.
    return <img className="agent-avatar" src={character.src} width={size} height={size} alt={`${name} character`} draggable={false} />;
  }
  return <span className="agent-avatar agent-avatar-initial" role="img" aria-label={`${name} character`} style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
    {character.letter}
  </span>;
}
