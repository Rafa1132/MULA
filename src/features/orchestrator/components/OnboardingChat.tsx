"use client";
import { useEffect, useRef, useState } from "react";
import { ChatComposer, ChatMessages } from "@/features/chat";
import type { ChatComposerState, ChatLine } from "@/features/chat";
import AboutForm from "./AboutForm";
import PersonalityForm from "./PersonalityForm";
import { FIELD_LABELS, answerQuestion, choosePersonality, confirmSummary, onboardingTranscript, skipAll, skipStep } from "../services/orchestrator";
import type { About, Field, OnboardingState, Personality, Question } from "../services/orchestrator";

type Props = {
  state: OnboardingState;
  onChange: (state: OnboardingState) => void;
  composer: ChatComposerState;
};

/**
 * The scripted onboarding, in the shared chat: the greeting, the questions answered so far, then
 * the current step. Answers go through the same composer as the chat (typed or dictated). Every
 * step can be skipped, and "Skip for now" ends it all.
 */
export default function OnboardingChat({ state, onChange, composer }: Props) {
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const stepHeading = useRef<HTMLParagraphElement>(null);
  const firstRender = useRef(true);
  const question = state.questions.find((each) => each.id === state.step);
  const busy = composer.busy;

  // Keyboard and screen reader users follow the conversation: each new step takes the focus,
  // except on the page's first load, where focus stays where the browser (or the page) put it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const answer = document.getElementById("onboarding-answer");
    if (answer) answer.focus();
    else stepHeading.current?.focus();
  }, [state.step]);

  async function run(action: () => Promise<OnboardingState>) {
    composer.setBusy(true);
    setError("");
    try {
      const next = await action();
      composer.setDraft("");
      setEditing(false);
      onChange(next);
    } catch (failure) {
      if (failure instanceof Error) setError(failure.message);
    } finally {
      composer.setBusy(false);
    }
  }

  function submitAnswer() {
    if (!question) return;
    const answer = composer.draftValue.current;
    if (!answer.trim()) {
      setError("Type an answer, or skip this question.");
      document.getElementById("onboarding-answer")?.focus();
      return;
    }
    void run(() => answerQuestion(question.id as Question, answer));
  }

  async function saveEdits(about: About) {
    await run(() => confirmSummary(about));
  }

  async function savePersonality(personality: Personality) {
    await run(() => choosePersonality(personality));
  }

  const lines: ChatLine[] = onboardingTranscript(state).map((line, index) => ({ id: `line-${index}`, role: line.from, text: line.text, skipped: line.skipped }));
  if (question) lines.push({ id: "current", role: "assistant", text: question.question });
  if (state.step === "summary") lines.push({ id: "summary", role: "assistant", text: "Here's what I'll remember about you. Does it look right?" });
  if (state.step === "personality") lines.push({ id: "personality", role: "assistant", text: "Last one, and optional: how should I talk to you? You can change this later in Settings." });

  return <div className="chat-body">
    <ChatMessages lines={lines} speaker={state.assistant_name} />

    {question && <>
      <ChatComposer composer={composer} inputId="onboarding-answer" label={question.question} placeholder={question.placeholder}
        maxLength={answerLimit(question.id)} liveAvailable={false} sendsEmpty onSend={submitAnswer}
        above={error && <p className="error" role="alert">{error}</p>} />
      <div className="chat-actions">
        <button type="button" className="account-toggle" disabled={busy} onClick={() => run(() => skipStep(question.id))}>Skip this question</button>
        <button type="button" className="text-button" disabled={busy} onClick={() => run(skipAll)}>Skip for now</button>
      </div>
    </>}

    {!question && error && <p className="error" role="alert">{error}</p>}

    {state.step === "summary" && !editing && <div className="assistant-summary">
      <p ref={stepHeading} tabIndex={-1} className="sr-only">Summary of your answers</p>
      <dl>
        {(Object.keys(FIELD_LABELS) as Field[]).map((field) => <div key={field}>
          <dt>{FIELD_LABELS[field]}</dt>
          <dd>{state.about[field] ?? "Not given"}</dd>
        </div>)}
      </dl>
      <div className="assistant-actions">
        <button type="button" className="account-submit" disabled={busy} onClick={() => run(() => confirmSummary(null))}>Looks right</button>
        <button type="button" className="account-toggle" disabled={busy} onClick={() => setEditing(true)}>Edit</button>
      </div>
    </div>}
    {state.step === "summary" && editing && <AboutForm initial={state.about} idPrefix="onboarding-edit" submitLabel="Save and continue" busy={busy}
      onSave={saveEdits} onCancel={() => setEditing(false)} />}

    {state.step === "personality" && <div>
      <p ref={stepHeading} tabIndex={-1} className="sr-only">Choose how your assistant talks to you</p>
      <PersonalityForm initial={state.personality} idPrefix="onboarding-personality" submitLabel="Save" busy={busy}
        onSave={savePersonality} onSkip={() => run(() => skipStep("personality"))} />
    </div>}

    {!question && <div className="chat-actions">
      <button type="button" className="text-button" disabled={busy} onClick={() => run(skipAll)}>Skip for now</button>
    </div>}
  </div>;
}

/** The assistant's name is kept short; profile answers can be a sentence. Both are checked on the server too. */
function answerLimit(question: Question) {
  if (question === "assistant_name") return 40;
  return 300;
}
