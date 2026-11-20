"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import { DEFAULT_PERSONALITY, PERSONALITY_LABELS } from "../services/orchestrator";
import type { Personality, PersonalityKey } from "../services/orchestrator";

type Props = {
  initial: Personality | null;
  idPrefix: string;
  submitLabel: string;
  busy: boolean;
  onSave: (personality: Personality) => Promise<void>;
  onSkip?: () => void;
};

const KEYS = Object.keys(PERSONALITY_LABELS) as PersonalityKey[];

/** Tone, formality, language and emoji, each a group of radio buttons. */
export default function PersonalityForm({ initial, idPrefix, submitLabel, busy, onSave, onSkip }: Props) {
  const [choices, setChoices] = useState<Personality>(() => {
    if (initial) return { ...initial };
    return { ...DEFAULT_PERSONALITY };
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave(choices);
  }

  return <form className="personality-form" onSubmit={submit}>
    {KEYS.map((key) => <fieldset key={key} disabled={busy}>
      <legend>{PERSONALITY_LABELS[key].label}</legend>
      <div className="personality-options">
        {Object.entries(PERSONALITY_LABELS[key].options).map(([value, label]) => {
          const id = `${idPrefix}-${key}-${value}`;
          return <label key={value} htmlFor={id} className="personality-option">
            <input type="radio" id={id} name={`${idPrefix}-${key}`} value={value} checked={choices[key] === value}
              onChange={() => setChoices({ ...choices, [key]: value })} />
            <span>{label}</span>
          </label>;
        })}
      </div>
    </fieldset>)}
    <div className="assistant-actions">
      <button type="submit" className="account-submit" disabled={busy}>{submitLabel}</button>
      {onSkip && <button type="button" className="account-toggle" onClick={onSkip} disabled={busy}>Skip</button>}
    </div>
  </form>;
}
