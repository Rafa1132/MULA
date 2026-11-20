"use client";
import { useEffect, useRef, useState } from "react";
import { ChatComposer, ChatMessages, ChatSuggestions, MAX_MESSAGE } from "@/features/chat";
import type { ChatComposerState, ChatLine } from "@/features/chat";
import ProposalCard from "./ProposalCard";
import { fetchAssistantMessages, proposalsByMessage, sendAssistantMessage } from "../services/orchestrator";
import type { AssistantMessage, CreatedProject, ProjectProposal } from "../services/orchestrator";

type Props = {
  assistantName: string;
  composer: ChatComposerState;
  // Shown above the conversation, e.g. right after onboarding ends.
  notice?: string;
  onProjectCreated?: (project: CreatedProject) => void;
};

const SUGGESTIONS = [
  { title: "Set up a new project", text: "Help me set up a new project for one of my businesses." },
  { title: "What can you do?", text: "What can you help me with across my projects?" },
  { title: "Plan my week", text: "Help me plan this week across my businesses." },
];

type Line = AssistantMessage & { note?: string };

/**
 * The owner's assistant across every project, in the shared chat (features/chat), so it looks and
 * behaves like a project's Operator: Markdown replies, spoken replies unless muted, the mic, live
 * conversation and Stop. Replies arrive whole rather than streamed; live conversation hears each
 * one when it arrives. Project proposals show as cards under the reply that made them.
 */
export default function AssistantChat({ assistantName, composer, notice, onProjectCreated }: Props) {
  const [messages, setMessages] = useState<Line[]>([]);
  const [proposals, setProposals] = useState<ProjectProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchAssistantMessages()
      .then((loaded) => {
        setMessages(loaded.messages);
        setProposals(loaded.proposals);
      })
      .catch((failure) => { if (failure instanceof Error) setError(failure.message); })
      .finally(() => setLoading(false));
  }, []);

  // The composer's mic, live conversation and Stop act on this chat. Registered after every render
  // so they always see the latest messages.
  useEffect(() => {
    composer.connect({ send: sendTurn, abort: () => controller.current?.abort() });
  });
  useEffect(() => () => {
    controller.current?.abort();
    composer.connect(null);
  }, []);

  async function sendTurn(raw: string, onToken?: (token: string) => void) {
    const text = raw.trim();
    if (!text || controller.current) return false;
    if (!onToken) composer.unlockAudio();
    const abort = new AbortController();
    controller.current = abort;
    // Shown at once; the ids are local until the conversation is next loaded.
    const sent: Line = { id: -Date.now(), role: "user", text };
    setMessages((current) => [...current, sent]);
    composer.setDraft("");
    composer.setBusy(true);
    setError("");
    try {
      const answer = await sendAssistantMessage(text, abort.signal);
      setMessages((current) => [...current, { id: answer.message_id, role: "assistant", text: answer.reply }]);
      setProposals((current) => [...current, ...answer.proposals]);
      if (onToken) onToken(answer.reply);
      else composer.playReply(answer.reply);
      return true;
    } catch (failure) {
      if (abort.signal.aborted) {
        // The server still finishes this turn; its reply is there the next time the chat opens.
        let note = "Stopped by you. The reply will be here next time you open the chat.";
        if (onToken) note = "Voice reply interrupted.";
        setMessages((current) => current.map((message) => {
          if (message === sent) return { ...message, note };
          return message;
        }));
      } else {
        // Give the text back so nothing typed is lost.
        setMessages((current) => current.filter((message) => message !== sent));
        composer.setDraft(text);
        if (failure instanceof Error) setError(failure.message);
      }
      return false;
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        composer.setBusy(false);
      }
    }
  }

  function pick(text: string) {
    composer.setDraft(text);
    document.getElementById("assistant-message")?.focus();
  }

  function replaceProposal(updated: ProjectProposal) {
    setProposals((current) => current.map((each) => {
      if (each.id === updated.id) return updated;
      return each;
    }));
  }

  const grouped = proposalsByMessage(proposals);
  const lines: ChatLine[] = messages.map((message) => ({ id: String(message.id), role: message.role, text: message.text, note: message.note }));
  if (composer.busy) lines.push({ id: "pending", role: "assistant", text: "" });

  return <div className="chat-body">
    {notice && <p className="chat-notice" role="status">{notice}</p>}
    <ChatMessages lines={lines} speaker={assistantName} loading={loading} onPlay={composer.playReply} playable={composer.canPlay}
      empty={<ChatSuggestions intro="Ask me anything about your business or across your projects. I can also set up a new project for you." items={SUGGESTIONS} onPick={pick} disabled={composer.busy} />}
      extra={(line) => (grouped.get(Number(line.id)) ?? []).map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} onChange={replaceProposal}
        onCreated={(project) => onProjectCreated?.(project)} />)} />
    <ChatComposer composer={composer} inputId="assistant-message" label={`Message ${assistantName}`} placeholder={`Message ${assistantName}`}
      maxLength={MAX_MESSAGE} disabled={loading} onSend={() => { void sendTurn(composer.draftValue.current); }}
      above={error && <p className="error" role="alert">{error}</p>} />
  </div>;
}
