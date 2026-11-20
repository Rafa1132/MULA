"use client";

import { useEffect, useState } from "react";

type Props = { place: "header" | "hero" };

// Signed-in visitors get a way back to their workspace instead of the sign-in buttons. The
// buttons render first, so the page works without JavaScript and doesn't wait for the check.
export default function LandingActions({ place }: Props) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => setSignedIn(response.ok))
      .catch(() => setSignedIn(false));
  }, []);

  if (signedIn) return <div className="landing-actions"><a className="account-submit landing-button" href="/workspace">Go to your workspace</a></div>;
  let loginClass = "landing-text-link";
  if (place === "hero") loginClass = "account-toggle landing-button";
  return <div className="landing-actions">
    <a className={loginClass} href="/login">Log in</a>
    <a className="account-submit landing-button" href="/register">Get started</a>
  </div>;
}
