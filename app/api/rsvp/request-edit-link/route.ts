import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateOpaqueToken, normalizeEmail, sha256Hex } from "@/lib/rsvpCrypto";
import { filterByInstance } from "@/lib/rsvpDb";
import { sendEditLinkEmail } from "@/lib/rsvpEmail";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const google_event_id = String(body.google_event_id || "");
    const recurring_instance_id =
      body.recurring_instance_id === null || body.recurring_instance_id === undefined
        ? null
        : String(body.recurring_instance_id);

    const emailRaw = String(body.email || "");
    if (!google_event_id || !emailRaw) {
      return NextResponse.json({ ok: false, error: "Missing google_event_id or email" }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);
    const supabase = supabaseAdmin();

    // Check if RSVP exists (but do not reveal result)
    let q = supabase
      .from("rsvps")
      .select("id")
      .eq("google_event_id", google_event_id)
      .eq("email", email);

    q = filterByInstance(q, recurring_instance_id);

    const { data: rsvp } = await q.maybeSingle();

    if (rsvp) {
      const rawToken = generateOpaqueToken(32);
      const token_hash = await sha256Hex(rawToken);

      const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 60 min
      const insertRes = await supabase.from("rsvp_tokens").insert({
        token_hash,
        action: "edit",
        google_event_id,
        recurring_instance_id,
        email,
        expires_at,
        used_at: null,
      });

      if (!insertRes.error) {
        const base = process.env.PUBLIC_BASE_URL || new URL(req.url).origin;
        const editUrl = new URL("/rsvp/edit", base);
        editUrl.searchParams.set("token", rawToken);

        await sendEditLinkEmail(email, editUrl.toString());
      }
    }

    // Always generic response
    return NextResponse.json({
      ok: true,
      message: "If an RSVP exists for that email, an edit link has been sent.",
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}