import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json({ error: "Missing start/end" }, { status: 400 });
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID!;
  const apiKey = process.env.GOOGLE_API_KEY!;
  console.log("Calendar ID in runtime:", calendarId);
console.log("Has API key:", !!apiKey);

  const url =
    "https://www.googleapis.com/calendar/v3/calendars/" +
    encodeURIComponent(calendarId) +
    "/events?" +
    new URLSearchParams({
      key: apiKey,
      timeMin: start,
      timeMax: end,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
    });

  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) {
    const details = await resp.text();
    return NextResponse.json({ error: "Google API error", details }, { status: 500 });
  }

  const data = await resp.json();

  const events = (data.items ?? [])
    .filter((e: any) => e.status !== "cancelled")
    .map((e: any) => ({
      google_event_id: e.recurringEventId ?? e.id,
      recurring_instance_id: e.recurringEventId ? e.id : null,
      title: e.summary ?? "(No title)",
      start: e.start?.dateTime ?? e.start?.date,
      end: e.end?.dateTime ?? e.end?.date,
      location: e.location ?? null,
      description: e.description ?? null,
    }));

  return NextResponse.json({ events });
}