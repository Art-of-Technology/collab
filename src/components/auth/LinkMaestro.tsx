"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function LinkMaestro({ googleVerified }: { googleVerified: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function connect() {
    setBusy(true);
    setError("");
    try {
      if (!googleVerified) {
        const response = await fetch("/api/auth/link-maestro", { method: "POST" });
        if (!response.ok) throw new Error("denied");
      }
      await signIn(googleVerified ? "maestro" : "google", { callbackUrl: "/account/link-maestro" }, googleVerified ? {} : { prompt: "select_account" });
    } catch {
      setError("Could not link your account. Reload to start again.");
      setBusy(false);
    }
  }
  return <div className="space-y-4">
    <p>Your Google login and existing Collab work stay with this account.</p>
    <Button disabled={busy} onClick={connect}>{busy ? "Continuing…" : googleVerified ? "Connect Maestro" : "Verify Google account"}</Button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
