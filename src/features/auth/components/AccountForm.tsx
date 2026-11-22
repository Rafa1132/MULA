"use client";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { MulaLogo } from "@/common/components";

export type AccountMode = "login" | "register";

type Props = {
  onSignedIn: () => Promise<void> | void;
  mode?: AccountMode;
  // On /login and /register the switch is a link to the other page; elsewhere (a page whose
  // session expired) it flips the form in place so the page can reload after signing in.
  standalone?: boolean;
};

type Rules = { relaxed: boolean; inviteRequired: boolean };
const DEFAULT_RULES: Rules = { relaxed: false, inviteRequired: false };

// The server says whether its development-only relaxed rules are on (MULA_RELAXED_AUTH) and whether
// sign-up needs an invite code (MULA_INVITE_CODE), so the form never asks for more, or less, than
// the server will accept.
async function fetchRules(): Promise<Rules> {
  const response = await fetch("/api/auth/rules", { cache: "no-store" });
  if (!response.ok) return DEFAULT_RULES;
  const rules = await response.json();
  return { relaxed: rules.relaxed === true, inviteRequired: rules.invite_required === true };
}

export default function AccountForm({ onSignedIn, mode = "login", standalone = false }: Props) {
  const [signup, setSignup] = useState(mode === "register");
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [username, setUsername] = useState("");
  const [invite, setInvite] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchRules().then(setRules).catch(() => setRules(DEFAULT_RULES));
  }, []);

  let title = "Welcome back";
  let action = "Log in";
  let toggle = "Create an account";
  let toggleHref = "/register";
  let endpoint = "login";
  let autocomplete = "current-password";
  if (signup) {
    title = "Your beginning starts here";
    action = "Create account";
    toggle = "I already have an account";
    toggleHref = "/login";
    endpoint = "signup";
    autocomplete = "new-password";
  }
  let usernameHint = "3–40 letters, numbers, dots, underscores or hyphens.";
  let passwordHint = "At least 10 characters.";
  let usernamePattern: string | undefined = "[A-Za-z0-9_.\\-]{3,40}";
  let passwordMin = 10;
  if (rules.relaxed) {
    usernameHint = "Development mode: any username works.";
    passwordHint = "Development mode: any password works.";
    usernamePattern = undefined;
    passwordMin = 1;
  }

  // Only sign-up takes an invite code; sign-in refuses unknown fields.
  const askInvite = signup && rules.inviteRequired;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body: Record<string, string> = { username, password };
    if (askInvite) body.invite = invite;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const failure = await response.json();
        if (typeof failure.detail === "string") throw new Error(failure.detail);
        // FastAPI's validation errors are a list; show the first rule that failed.
        if (Array.isArray(failure.detail) && typeof failure.detail[0]?.msg === "string") throw new Error(failure.detail[0].msg.replace(/^Value error, /, ""));
        throw new Error("Check your username and password and try again.");
      }
      setPassword("");
      await onSignedIn();
    } catch (failure) {
      if (failure instanceof Error) setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setSignup(!signup);
    setError("");
  }

  return <main className="account-screen">
    <form className="account-card" onSubmit={submit} aria-labelledby="account-title">
      <a href="/" className="account-home" aria-label="Mula home"><MulaLogo /></a>
      <h1 id="account-title">{title}</h1>
      <p>Your business, your agents, one ongoing conversation.</p>
      <label htmlFor="username">Username</label>
      <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" maxLength={40} pattern={usernamePattern} aria-describedby="username-hint" required disabled={busy} />
      <small id="username-hint">{usernameHint}</small>
      <label htmlFor="password">Password</label>
      <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={autocomplete} minLength={passwordMin} maxLength={128} aria-describedby="password-hint" required disabled={busy} />
      <small id="password-hint">{passwordHint}</small>
      {askInvite && <>
        <label htmlFor="invite">Invite code</label>
        <input id="invite" value={invite} onChange={(event) => setInvite(event.target.value)} autoComplete="off" spellCheck={false} maxLength={200} aria-describedby="invite-hint" required disabled={busy} />
        <small id="invite-hint">Ask the person who runs this Mula for one.</small>
      </>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="account-submit" disabled={busy}>{action}</button>
      {standalone && <a className="account-toggle account-link" href={toggleHref}>{toggle}</a>}
      {!standalone && <button className="account-toggle" type="button" disabled={busy} onClick={switchMode}>{toggle}</button>}
    </form>
  </main>;
}
