import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sha256Hex } from "@/lib/rsvpCrypto";
import { filterByInstance } from "@/lib/rsvpDb";
import EditForm from "./ui";

export const runtime = "edge";

export default async function EditPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token || "";
  if (!token) {
    return (
      <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
        <h1>Edit RSVP</h1>
        <p>Missing token.</p>
      </main>
    );
  }

  const supabase = supabaseAdmin();
  const token_hash = await sha256Hex(token);

  const { data: tok } = await supabase
    .from("rsvp_tokens")
    .select("action, google_event_id, recurring_instance_id, email, expires_at, used_at")
    .eq("token_hash", token_hash)
    .maybeSingle();

  if (!tok || tok.action !== "edit") {
    return (
      <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
        <h1>Edit RSVP</h1>
        <p>Invalid link.</p>
      </main>
    );
  }

  if (tok.used_at) {
    return (
      <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
        <h1>Edit RSVP</h1>
        <p>This link has already been used.</p>
      </main>
    );
  }

  if (new Date(tok.expires_at).getTime() <= Date.now()) {
    return (
      <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
        <h1>Edit RSVP</h1>
        <p>This link has expired.</p>
      </main>
    );
  }

  let q = supabase
    .from("rsvps")
    .select("name,email,status,google_event_id,recurring_instance_id")
    .eq("google_event_id", tok.google_event_id)
    .eq("email", tok.email);

  q = filterByInstance(q, tok.recurring_instance_id);

  const { data: rsvp } = await q.maybeSingle();

  if (!rsvp) {
    return (
      <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
        <h1>Edit RSVP</h1>
        <p>Could not find an RSVP for this link.</p>
      </main>
    );
  }

  return <EditForm initial={rsvp} token={token} />;
}