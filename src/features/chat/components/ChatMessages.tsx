"use client";

// The shared conversation: the agent's lines on the left with its name, the owner's on the right,
// replies in Markdown, a note under a line, "Play reply", and room under a reply for its cards
// (the workspace's project proposals, a project's agent requests). It scrolls inside itself and
// follows new lines only while the owner is at the bottom, so reading back is never interrupted.
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import Markdown from "react-markdown";
import { Icon } from "@/common/components";

export type ChatLine = {
  id: string;
  role: "user" | "assistant";
  text: string;
  note?: string;
  /** An onboarding answer the owner skipped: shown as "Skipped", in italics. */
  skipped?: boolean;
};

type Props = {
  lines: ChatLine[];
  /** The agent's name, on each of its lines and in the log's name. */
  speaker: string;
  loading?: boolean;
  /** Shown when there are no lines yet. */
  empty?: ReactNode;
  /** Cards under a line, e.g. proposals or agent requests. */
  extra?: (line: ChatLine) => ReactNode;
  /** When given, a finished reply offers "Play reply"... */
  onPlay?: (text: string) => void;
  /** ...while this is true (not while muted, busy or listening). */
  playable?: boolean;
};

/** Links in replies open in a new tab; raw HTML is never rendered. */
function Reply({ text }: { text: string }) {
  return <Markdown skipHtml components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer noopener" /> }}>{text}</Markdown>;
}

export default function ChatMessages({ lines, speaker, loading = false, empty, extra, onPlay, playable = true }: Props) {
  const log = useRef<HTMLOListElement>(null);
  const following = useRef(true);

  useEffect(() => {
    if (log.current && following.current) log.current.scrollTop = log.current.scrollHeight;
  }, [lines]);

  function onScroll() {
    const element = log.current;
    if (element) following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  }

  return <ol ref={log} className="chat-log" role="log" aria-label={`Conversation with ${speaker}`} aria-busy={loading} onScroll={onScroll}>
    {!loading && lines.length === 0 && empty && <li className="chat-empty">{empty}</li>}
    {lines.map((line) => <li key={line.id} className={`chat-line from-${line.role}`} data-skipped={line.skipped === true}>
      {line.role === "assistant" && <span className="chat-speaker">{speaker}</span>}
      {line.role === "user" && <span className="sr-only">You: </span>}
      {line.text && line.role === "assistant" && <div className="chat-text"><Reply text={line.text} /></div>}
      {line.text && line.role === "user" && <div className="chat-text">{line.text}</div>}
      {!line.text && !line.note && <span className="waiting-label">Preparing your reply</span>}
      {line.note && <p className="chat-note">{line.note}</p>}
      {extra?.(line)}
      {onPlay && playable && line.role === "assistant" && line.text && <button type="button" className="play-reply text-button" onClick={() => onPlay(line.text)}><Icon name="voice" />Play reply</button>}
    </li>)}
  </ol>;
}
