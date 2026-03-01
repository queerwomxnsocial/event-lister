import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateOpaqueToken, normalizeEmail, sha256Hex } from "@/lib/rsvpCrypto";
import { filterByInstance } from "@/lib/rsvpDb";
import { sendEditLinkEmail } from "@/lib/rsvpEmail";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const google_event_id = String(body.google_event_id ?? "").trim();

    // Treat undefined / null / "" as null
    const recurring_instance_id_raw =
      body.recurring_instance_id === undefined || body.recurring_instance_id === null
        ? ""
        : String(body.recurring_instance_id);
    const recurring_instance_id = recurring_instance_id_raw.trim() ? recurring_instance_id_raw.trim() : null;

    const emailRaw = String(body.email ?? "").trim();

    if (!google_event_id || !emailRaw) {
      return NextResponse.json(
        { ok: false, error: "Missing google_event_id or email" },
        { status: 400 }
      );
    }

    const email = normalizeEmail(emailRaw);
    const supabase = supabaseAdmin();

    // 1) Check if RSVP exists (do not reveal result)
    let q = supabase
      .from("rsvps")
      .select("id")
      .eq("google_event_id", google_event_id)
      .eq("email", email);

    q = filterByInstance(q as any, recurring_instance_id);

    const { data: rsvp, error: rsvpErr } = await q.maybeSingle();

    if (rsvpErr) {
      console.error("RSVP lookup error:", rsvpErr);
      // Still return generic response (don’t leak anything)
      return NextResponse.json({
        ok: true,
        message: "If an RSVP exists for that email, an edit link has been sent.",
      });
    }

    // 2) If RSVP exists, create token + email it
    if (rsvp) {
      const rawToken = generateOpaqueToken(32);
      const token_hash = await sha256Hex(rawToken);
      const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 60 minutes

      const { error: insertErr } = await supabase.from("rsvp_tokens").insert({
        token_hash,
        action: "edit",
        google_event_id,
        recurring_instance_id,
        email,
        expires_at,
        used_at: null,
      });

      if (insertErr) {
        console.error("Token insert error:", insertErr);
        // Return generic success anyway
        return NextResponse.json({
          ok: true,
          message: "If an RSVP exists for that email, an edit link has been sent.",
        });
      }

      const base = process.env.PUBLIC_BASE_URL || new URL(req.url).origin;
      const editUrl = new URL("/rsvp/edit", base);
      editUrl.searchParams.set("token", rawToken);

      try {
        await sendEditLinkEmail(email, editUrl.toString());
      } catch (emailErr) {
        console.error("Email send error:", emailErr);
        // Still return generic response
      }
    }

    // 3) Always generic response
    return NextResponse.json({
      ok: true,
      message: "If an RSVP exists for that email, an edit link has been sent.",
    });
  } catch (e: any) {
    console.error("request-edit-link route error:", e?.message || e, e?.stack);
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}