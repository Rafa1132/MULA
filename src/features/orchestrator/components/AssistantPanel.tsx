"use client";
import { useState } from "react";
import type { ChatComposerState } from "@/features/chat";
import AssistantChat from "./AssistantChat";
import OnboardingChat from "./OnboardingChat";
import type { CreatedProject, OnboardingState } from "../services/orchestrator";

type Props = {
  state: OnboardingState;
  onChange: (state: OnboardingState) => void;
  composer: ChatComposerState;
  onProjectCreated?: (project: CreatedProject) => void;
};

/**
 * The assistant's chat on the workspace: onboarding while it runs, then the ongoing chat. The
 * onboarding state and the shared composer come from the page (EntryStage), which also runs the
 * spoken welcome.
 */
export default function AssistantPanel({ state, onChange, composer, onProjectCreated }: Props) {
  // Set when onboarding ends during this visit, to thank the owner instead of starting cold.
  const [justFinished, setJustFinished] = useState<"completed" | "skipped" | null>(null);

  function update(next: OnboardingState) {
    if (next.status === "done" && state.status === "active") setJustFinished(next.finished);
    onChange(next);
  }

  if (state.status === "active") return <OnboardingChat state={state} onChange={update} composer={composer} />;

  let notice: string | undefined;
  if (justFinished === "completed") {
    notice = "Thanks, you're all set. I've saved this to your profile; change it any time in Settings.";
    if (state.about.name) notice = `Thanks, ${state.about.name}, you're all set. I've saved this to your profile; change it any time in Settings.`;
  }
  if (justFinished === "skipped") notice = "No problem. Everything works without it, and you can answer the questions any time from Settings.";
  return <AssistantChat assistantName={state.assistant_name} composer={composer} notice={notice} onProjectCreated={onProjectCreated} />;
}
