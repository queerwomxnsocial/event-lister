"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RSVPPage() {
  const router = useRouter();

  const [google_event_id, setGoogleEventId] = useState("");
  const [recurring_instance_id, setInstanceId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);

    try {
      const payload = {
        google_event_id,
        recurring_instance_id: recurring_instance_id || null,
        name,
        email,
      };

      const res = await fetch("/api/rsvp/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        // If we ever get HTML back, this prevents a crash.
        console.error("Non-JSON response from /api/rsvp/submit:", text);
      }

      if (res.ok) {
        router.push("/rsvp/success");
        return;
      }

      if (res.status === 409 && data?.alreadyExists) {
        const qp = new URLSearchParams({
          google_event_id,
          recurring_instance_id,
          email,
        });
        router.push(`/rsvp/already?${qp.toString()}`);
        return;
      }

      setMsg(data?.error || `Something went wrong (status ${res.status}).`);
    } catch (err) {
      console.error(err);
      setMsg("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1>RSVP</h1>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Google Event ID
          <input
            value={google_event_id}
            onChange={(e) => setGoogleEventId(e.target.value)}
            required
          />
        </label>

        <label>
          Recurring Instance ID (optional)
          <input
            value={recurring_instance_id}
            onChange={(e) => setInstanceId(e.target.value)}
          />
        </label>

        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </label>

        <button disabled={busy} type="submit">
          {busy ? "Submitting…" : "Submit RSVP"}
        </button>

        {msg && <p style={{ color: "crimson" }}>{msg}</p>}
      </form>
    </main>
  );
}