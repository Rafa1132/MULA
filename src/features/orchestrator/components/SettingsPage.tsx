"use client";
import { useEffect, useState } from "react";
import { MulaLogo } from "@/common/components";
import { AccountForm } from "@/features/auth";
import AboutForm from "./AboutForm";
import AssistantSettingsForm from "./AssistantSettingsForm";
import PersonalityForm from "./PersonalityForm";
import { fetchProfile, restartOnboarding, saveAbout, savePersonality } from "../services/orchestrator";
import type { About, Personality } from "../services/orchestrator";
import "../orchestrator.css";

type Profile = { about: About; personality: Personality | null };
type Status = { message: string; failed: boolean };

/** A save's outcome: an alert when it failed, a polite status when it worked. */
function SaveStatus({ status }: { status: Status }) {
  if (!status.message) return null;
  if (status.failed) return <p className="error" role="alert">{status.message}</p>;
  return <p className="settings-saved" role="status">{status.message}</p>;
}

/** /settings: the assistant's name and tools, what it knows about the owner (USER.md), its personality, and onboarding again. */
export default function SettingsPage() {
  const [signedIn, setSignedIn] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [aboutStatus, setAboutStatus] = useState<Status>({ message: "", failed: false });
  const [personalityStatus, setPersonalityStatus] = useState<Status>({ message: "", failed: false });
  const [restartError, setRestartError] = useState("");

  async function load() {
    setLoadError("");
    try {
      setProfile(await fetchProfile());
      setSignedIn(true);
    } catch (failure) {
      if (failure instanceof Error && "status" in failure && failure.status === 401) setSignedIn(false);
      else if (failure instanceof Error) setLoadError(failure.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveProfile(about: About) {
    setBusy(true);
    setAboutStatus({ message: "", failed: false });
    try {
      const saved = await saveAbout(about);
      setProfile((current) => { if (current === null) return current; return { ...current, about: saved.about }; });
      setAboutStatus({ message: "Saved.", failed: false });
    } catch (failure) {
      if (failure instanceof Error) setAboutStatus({ message: failure.message, failed: true });
    } finally {
      setBusy(false);
    }
  }

  async function savePersonalityChoices(personality: Personality) {
    setBusy(true);
    setPersonalityStatus({ message: "", failed: false });
    try {
      const saved = await savePersonality(personality);
      setProfile((current) => { if (current === null) return current; return { ...current, personality: saved.personality }; });
      setPersonalityStatus({ message: "Saved. Your assistant uses it from the next message.", failed: false });
    } catch (failure) {
      if (failure instanceof Error) setPersonalityStatus({ message: failure.message, failed: true });
    } finally {
      setBusy(false);
    }
  }

  async function restart() {
    setBusy(true);
    setRestartError("");
    try {
      await restartOnboarding();
      window.location.assign("/workspace#assistant");
    } catch (failure) {
      if (failure instanceof Error) setRestartError(failure.message);
      setBusy(false);
    }
  }

  if (!signedIn) return <AccountForm onSignedIn={load} />;
  if (loadError) return <main className="account-screen"><div><p role="alert">{loadError}</p><button type="button" className="account-toggle" onClick={load}>Try again</button></div></main>;
  if (!profile) return <main className="account-screen"><p role="status"><span className="shimmer">Opening your settings…</span></p></main>;

  return <div className="settings-page">
    <header className="settings-header">
      <a href="/" className="workspace-brand" aria-label="Mula home"><MulaLogo /></a>
      <a className="text-button" href="/workspace">Back to your workspace</a>
    </header>
    <main className="settings-main">
      <h1>Settings</h1>
      <p className="settings-lead">What your assistant knows about you and how it talks. Only you can see this; your projects&apos; teammates and agents can&apos;t.</p>

      <section className="settings-section" aria-labelledby="settings-assistant-title">
        <h2 id="settings-assistant-title">Your assistant</h2>
        <p>Its name shows above the orb and in the chat.</p>
        <AssistantSettingsForm />
      </section>

      <section className="settings-section" aria-labelledby="settings-about-title">
        <h2 id="settings-about-title">About you</h2>
        <p>Saved in your profile (USER.md) and given to your assistant with every message.</p>
        <AboutForm initial={profile.about} idPrefix="settings-about" submitLabel="Save" busy={busy} onSave={saveProfile} />
        <SaveStatus status={aboutStatus} />
      </section>

      <section className="settings-section" aria-labelledby="settings-personality-title">
        <h2 id="settings-personality-title">Personality</h2>
        <p>How your assistant talks to you.</p>
        <PersonalityForm initial={profile.personality} idPrefix="settings-personality" submitLabel="Save" busy={busy} onSave={savePersonalityChoices} />
        <SaveStatus status={personalityStatus} />
      </section>

      <section className="settings-section" aria-labelledby="settings-onboarding-title">
        <h2 id="settings-onboarding-title">Getting started</h2>
        <p>Answer the welcome questions again in your assistant&apos;s chat. Your current answers stay until you replace them.</p>
        <button type="button" className="account-toggle" onClick={restart} disabled={busy}>Restart the questions</button>
        {restartError && <p className="error" role="alert">{restartError}</p>}
      </section>
    </main>
  </div>;
}
