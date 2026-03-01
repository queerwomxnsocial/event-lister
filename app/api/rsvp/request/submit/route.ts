import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeEmail } from "@/lib/rsvpCrypto";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const google_event_id = String(body.google_event_id || "");
    const recurring_instance_id =
      body.recurring_instance_id === null || body.recurring_instance_id === undefined
        ? null
        : String(body.recurring_instance_id);

    const name = String(body.name || "").trim();
    const emailRaw = String(body.email || "");

    if (!google_event_id || !name || !emailRaw) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }

    const email = normalizeEmail(emailRaw);

    const supabase = supabaseAdmin();

    const { error } = await supabase.from("rsvps").insert({
      google_event_id,
      recurring_instance_id,
      name,
      email,          // citext handles case-insensitivity but we normalize anyway
      status: "going" // no confirm flow
    });

    if (error) {
      // Supabase/Postgres unique violation is typically code "23505"
      const pgCode = (error as any).code;
      if (pgCode === "23505") {
        return NextResponse.json(
          { ok: false, alreadyExists: true, message: "RSVP already exists for that email." },
          { status: 409 }
        );
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}