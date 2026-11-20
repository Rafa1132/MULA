"use client";

// The shared chat screen, the same on the workspace and in every project: black in both themes,
// the agent's name above the new orb, a status line, the conversation filling the rest, and a
// Mute button at the top. "Expand chat" shrinks the orb to give the conversation the room.
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "@/common/components";
import { OrchestratorOrb } from "@/features/orb";
import type { ChatComposerState } from "../hooks/useChatComposer";
import { orbSizeFor } from "../services/chat";
import "../chat.css";

type Props = {
  composer: ChatComposerState;
  /** The agent's name, shown above the orb. */
  name: string;
  /** A visually hidden page heading. */
  title: string;
  /** Left of the top bar (a logo or the project switcher on phones). */
  start?: ReactNode;
  /** Right of the top bar, after Mute (account controls). */
  end?: ReactNode;
  /** Under the conversation, outside it (the workspace's "Your projects" cue). */
  footer?: ReactNode;
  /** Makes the orb a pointer target too (the workspace's "Tap to begin"). */
  onOrbClick?: () => void;
  id?: string;
  className?: string;
  /** Extra data attributes, e.g. the workspace's entrance. */
  entrance?: string;
  children: ReactNode;
};

function useViewport() {
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return size;
}

export default function ChatStage({ composer, name, title, start, end, footer, onOrbClick, id, className, entrance, children }: Props) {
  const [expanded, setExpanded] = useState(false);
  const viewport = useViewport();
  let classes = "chat-stage";
  if (className) classes += ` ${className}`;
  let muteIcon: "voice" | "muted" = "voice";
  if (composer.muted) muteIcon = "muted";
  let presenceClass = "";
  if (composer.preparing) presenceClass = "shimmer";

  return <section id={id} className={classes} data-entrance={entrance} data-expanded={expanded} aria-label={title}>
    <div className="chat-top">
      <div className="chat-top-start">{start}</div>
      <div className="chat-top-end">
        <button type="button" className="chat-mute" aria-pressed={composer.muted} onClick={() => composer.setMuted(!composer.muted)}>
          <Icon name={muteIcon} /><span>Mute</span>
        </button>
        {end}
      </div>
    </div>

    <div className="chat-center">
      <h1 className="sr-only">{title}</h1>
      <div className="chat-identity">
        <p className="chat-name" aria-live="polite">{name}</p>
        {/* A pointer shortcut only; the page always offers a button for the same action. */}
        <div className="chat-orb" data-tappable={onOrbClick !== undefined} onClick={onOrbClick}>
          <OrchestratorOrb size={orbSizeFor(viewport.width, viewport.height, expanded)} state={composer.orbState} audio={composer.analyser} />
        </div>
        <p className="chat-presence" role="status"><span className="presence-dot" data-live={composer.audioLive} /><span className={presenceClass}>{composer.presence}</span></p>
      </div>
      <button type="button" className="chat-expand" aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>Expand chat</button>
      <div className="chat-panel">{children}</div>
    </div>
    {footer}
  </section>;
}
