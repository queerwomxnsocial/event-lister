import { NextResponse } from "next/server";

export async function GET() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? null;
  const hasApiKey = !!process.env.GOOGLE_API_KEY;

  return NextResponse.json({
    calendarId,
    hasApiKey,
  });
}