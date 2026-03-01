// app/rsvp/already/ui.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function AlreadyClient() {
  const sp = useSearchParams();
  const google_event_id = sp.get("google_event_id") || "";
  const recurring_instance_id = sp.get("recurring_instance_id") || "";
  const email = sp.get("email") || "";

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendLink() {
    setBusy(true);
    setMsg(null);

    const res = await fetch("/api/rsvp/request-edit-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        google_event_id,
        recurring_instance_id: recurring_instance_id || null,
        email,
      }),
    });

    setBusy(false);

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMsg(data?.message || "If an RSVP exists, an edit link has been sent.");
    } else {
      setMsg(data?.error || "Could not send link.");
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1>RSVP already received</h1>
      <p>We already have an RSVP for that email for this event.</p>

      <button disabled={busy} onClick={sendLink}>
        {busy ? "Sending…" : "Email me an edit link"}
      </button>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}