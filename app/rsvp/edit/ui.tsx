"use client";

import { useState } from "react";

export default function EditForm({
  initial,
  token,
}: {
  initial: {
    name: string;
    email: string;
    status: string;
    google_event_id: string;
    recurring_instance_id: string | null;
  };
  token: string;
}) {
  const [name, setName] = useState(initial.name);
  const [status, setStatus] = useState(initial.status);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    const res = await fetch("/api/rsvp/edit/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name, status }),
    });

    setBusy(false);

    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMsg("Saved!");
    } else {
      setMsg(data?.error || "Could not save changes.");
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1>Edit RSVP</h1>
      <p style={{ opacity: 0.8 }}>{initial.email}</p>

      <form onSubmit={onSave} style={{ display: "grid", gap: 12 }}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="going">Going</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>

        <button disabled={busy} type="submit">
          {busy ? "Saving…" : "Save changes"}
        </button>

        {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
      </form>
    </main>
  );
}