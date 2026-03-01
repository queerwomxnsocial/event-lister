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

// base64url encoding for tokens
function base64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  const b64 = btoa(s);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function generateOpaqueToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return base64url(arr);
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Send email (Resend example). Swap provider if needed.
async function sendEditLinkEmail(to: string, editUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    throw new Error("Email environment variables are not configured (RESEND_API_KEY / RESEND_FROM).");
  }

  const subject = "Edit your RSVP";
  const html = `
    <p>Here’s your secure link to edit your RSVP:</p>
    <p><a href="${editUrl}">Edit my RSVP</a></p>
    <p>This link expires in 60 minutes.</p>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to send email: ${res.status} ${text}`);
  }
}

/* -------------------- Route -------------------- */

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const google_event_id = String(body.google_event_id || "").trim();
    const recurring_instance_id =
      body.recurring_instance_id === null ||
      body.recurring_instance_id === undefined ||
      body.recurring_instance_id === ""
        ? null
        : String(body.recurring_instance_id);

    const emailRaw = String(body.email || "");

    if (!google_event_id || !emailRaw) {
      return NextResponse.json(
        { ok: false, error: "Missing google_event_id or email." },
        { status: 400 }
      );
    }

    const email = normalizeEmail(emailRaw);
    const supabase = getSupabaseAdmin();

    // 1) Check if RSVP exists (NULL-safe on recurring_instance_id)
    let q = supabase
      .from("rsvps")
      .select("id")
      .eq("google_event_id", google_event_id)
      .eq("email", email);

    if (recurring_instance_id === null) {
      q = q.is("recurring_instance_id", null);
    } else {
      q = q.eq("recurring_instance_id", recurring_instance_id);
    }

    const { data: rsvp, error: rsvpErr } = await q.maybeSingle();

    // 2) If RSVP exists, create a token + email it
    // IMPORTANT: always return a generic success message (do not leak existence)
    if (!rsvpErr && rsvp) {
      const rawToken = generateOpaqueToken(32);
      const token_hash = await sha256Hex(rawToken);

      const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 60 min

      // Optional: delete any older unused edit tokens for this same key to reduce clutter
      // await supabase
      //   .from("rsvp_tokens")
      //   .delete()
      //   .eq("action", "edit")
      //   .eq("google_event_id", google_event_id)
      //   .eq("email", email)
      //   .is("used_at", null);

      const { error: tokErr } = await supabase.from("rsvp_tokens").insert({
        token_hash,
        action: "edit",
        google_event_id,
        recurring_instance_id,
        email,
        expires_at,
        used_at: null,
      });

      if (tokErr) {
        console.error("Token insert error:", tokErr);
      } else {
        const base = process.env.PUBLIC_BASE_URL || new URL(req.url).origin;
        const editUrl = new URL("/rsvp/edit", base);
        editUrl.searchParams.set("token", rawToken);

        await sendEditLinkEmail(email, editUrl.toString());
      }
    }

    // 3) Always generic response
    return NextResponse.json({
      ok: true,
      message: "If an RSVP exists for that email, an edit link has been sent.",
    });
  } catch (err: any) {
    console.error("request-edit-link error:", err?.message || err, err?.stack);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}