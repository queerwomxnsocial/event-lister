import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

/* -------------------- Helpers -------------------- */

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

/* -------------------- Route -------------------- */

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const google_event_id = String(body.google_event_id || "").trim();
    const name = String(body.name || "").trim();
    const emailRaw = String(body.email || "");
    const recurring_instance_id =
      body.recurring_instance_id === null ||
      body.recurring_instance_id === undefined ||
      body.recurring_instance_id === ""
        ? null
        : String(body.recurring_instance_id);

    if (!google_event_id || !name || !emailRaw) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields." },
        { status: 400 }
      );
    }

    const email = normalizeEmail(emailRaw);

    const supabase = getSupabaseAdmin();

    const { error } = await supabase.from("rsvps").insert({
      google_event_id,
      recurring_instance_id,
      name,
      email,
      status: "going", // no confirmation flow
    });

    if (error) {
      // 23505 = unique constraint violation
      if ((error as any).code === "23505") {
        return NextResponse.json(
          {
            ok: false,
            alreadyExists: true,
            message: "An RSVP already exists for this email.",
          },
          { status: 409 }
        );
      }

      console.error("Supabase insert error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("RSVP submit route error:", err?.message || err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}