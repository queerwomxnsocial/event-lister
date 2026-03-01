import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeEmail, sha256Hex } from "@/lib/rsvpCrypto";
import { filterByInstance } from "@/lib/rsvpDb";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const token = String(body.token || "");
    const name = String(body.name || "").trim();
    const status = String(body.status || "").trim(); // 'going' | 'cancelled' etc.

    if (!token || !name) {
      return NextResponse.json({ ok: false, error: "Missing token or name" }, { status: 400 });
    }

    const token_hash = await sha256Hex(token);
    const supabase = supabaseAdmin();

    // 1) Load token row
    const { data: tok, error: tokErr } = await supabase
      .from("rsvp_tokens")
      .select("token_hash, action, google_event_id, recurring_instance_id, email, expires_at, used_at")
      .eq("token_hash", token_hash)
      .maybeSingle();

    if (tokErr || !tok) {
      return NextResponse.json({ ok: false, error: "Invalid link" }, { status: 400 });
    }

    if (tok.action !== "edit") {
      return NextResponse.json({ ok: false, error: "Invalid link action" }, { status: 400 });
    }

    if (tok.used_at) {
      return NextResponse.json({ ok: false, error: "This link has already been used." }, { status: 400 });
    }

    if (new Date(tok.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: "This link has expired." }, { status: 400 });
    }

    const email = normalizeEmail(tok.email);

    // 2) Update RSVP row
    let upd = supabase
      .from("rsvps")
      .update({
        name,
        status: status || "going",
      })
      .eq("google_event_id", tok.google_event_id)
      .eq("email", email);

    upd = filterByInstance(upd, tok.recurring_instance_id);

    const { error: updErr } = await upd;
    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }

    // 3) Consume token (single-use)
    const { error: useErr } = await supabase
      .from("rsvp_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("token_hash", token_hash);

    if (useErr) {
      // RSVP update already happened; still return ok but log this.
      console.warn("Token consume failed:", useErr.message);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}