"use client";

import { useEffect } from "react";
import { AccountForm } from "@/features/auth";
import type { AccountMode } from "@/features/auth";

// After signing in or registering, everyone starts at the workspace (where onboarding greets
// new accounts). Someone already signed in skips the form.
function toWorkspace() {
  window.location.assign("/workspace");
}

// A new account opens at the assistant, where onboarding starts; on a phone that section sits
// below the projects and would otherwise be off screen.
function toOnboarding() {
  window.location.assign("/workspace#assistant");
}

export default function AccountPage({ mode }: { mode: AccountMode }) {
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => { if (response.ok) toWorkspace(); })
      .catch(() => undefined);
  }, []);
  let afterSignIn = toWorkspace;
  if (mode === "register") afterSignIn = toOnboarding;
  return <AccountForm mode={mode} standalone onSignedIn={afterSignIn} />;
}
