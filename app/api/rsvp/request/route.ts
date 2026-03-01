import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

/* -------------------------------------------------- */
/* Utilities */
/* -------------------------------------------------- */

function json(status: number, body: any, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers });
}

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function hashIp(ip: string) {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function safeString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = safeString(v);
  return s.length ? s : null;
}

function isValidEmail(email: string) {
  const e = email.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/* -------------------------------------------------- */
/* Lazy singletons (important for Cloudflare builds) */
/* -------------------------------------------------- */

let _supabase: ReturnType<typeof createClient> | null = null;
let _perIpGlobal: Ratelimit | null = null;
let _perEvent: Ratelimit | null = null;

function getSupabase() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase environment variables are not configured.");
  }

  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }

  return _supabase;
}

function getRateLimiters() {
  const redis = Redis.fromEnv();

  if (!_perIpGlobal) {
    _perIpGlobal = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(12, "1 h"),
    });
  }

  if (!_perEvent) {
    _perEvent = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(3, "5 m"),
    });
  }

  return { perIpGlobal: _perIpGlobal!, perEvent: _perEvent! };
}

/* -------------------------------------------------- */
/* Route */
/* -------------------------------------------------- */

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Honeypot
    if (safeString(body.company)) {
      return json(400, { error: "Invalid submission." });
    }

    const google_event_id = safeString(body.google_event_id);
    const recurring_instance_id = normalizeNullableString(body.recurring_instance_id);
    const name = safeString(body.name);
    const email = safeString(body.email).toLowerCase();
    const rsvp_status: "going" | "maybe" =
      body.status === "maybe" ? "maybe" : "going";

    if (!google_event_id)
      return json(400, { error: "Missing google_event_id" });

    if (name.length < 2)
      return json(400, { error: "Name must be at least 2 characters" });

    if (!isValidEmail(email))
      return json(400, { error: "Invalid email address" });

    const supabase = getSupabase();
    const { perIpGlobal, perEvent } = getRateLimiters();

    /* ---------------- Rate limiting ---------------- */

    const ip = getClientIp(req);
    const ipHash = hashIp(ip);
    const eventKey = `${google_event_id}::${recurring_instance_id ?? ""}`;

    const globalRes = await perIpGlobal.limit(`rsvp:ip:${ipHash}`);
    if (!globalRes.success) {
      const retryAfter = Math.max(
        1,
        Math.floor((globalRes.reset - Date.now()) / 1000)
      );
      return json(
        429,
        { error: "Too many requests. Please try again later." },
        { "Retry-After": String(retryAfter) }
      );
    }

    const eventRes = await perEvent.limit(
      `rsvp:ip:${ipHash}:event:${eventKey}`
    );
    if (!eventRes.success) {
      const retryAfter = Math.max(
        1,
        Math.floor((eventRes.reset - Date.now()) / 1000)
      );
      return json(
        429,
        {
          error:
            "Too many RSVPs for this event from your network. Please try again later.",
        },
        { "Retry-After": String(retryAfter) }
      );
    }

    /* ---------------- Database upsert ---------------- */

    // Explicit insert type avoids Supabase `never` typing issue
    type RSVPInsert = {
      google_event_id: string;
      recurring_instance_id: string | null;
      name: string;
      email: string;
      rsvp_status: "going" | "maybe";
    };

    const payload: RSVPInsert = {
      google_event_id,
      recurring_instance_id,
      name,
      email,
      rsvp_status,
    };

    const { data, error } = await supabase
      .from("rsvps")
      .upsert(payload as any, {
        onConflict: "google_event_id,recurring_instance_id,email",
      })
      .select("id, google_event_id, recurring_instance_id, rsvp_status")
      .maybeSingle();

    if (error) {
      return json(500, { error: error.message });
    }

    return json(200, {
      ok: true,
      rsvp: data ?? null,
    });
  } catch (err: any) {
    return json(500, { error: err?.message || "Server error" });
  }
}