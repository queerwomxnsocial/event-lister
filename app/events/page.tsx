"use client";

import "./events.css";

import React, { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg } from "@fullcalendar/core";

type ApiEvent = {
  google_event_id: string;
  recurring_instance_id: string | null;
  title: string;
  start: string; // ISO or YYYY-MM-DD
  end: string; // ISO or YYYY-MM-DD
  location: string | null;
  description: string | null; // single URL, sometimes wrapped in HTML <a>
  attendeeCount?: number; // later
};

type Theme = "light" | "dark";

type Toast = {
  id: string;
  kind: "success" | "error" | "info";
  title: string;
  message?: string;
};

function toIsoZ(d: Date) {
  return d.toISOString();
}

function eventKey(e: Pick<ApiEvent, "google_event_id" | "recurring_instance_id">) {
  return `${e.google_event_id}::${e.recurring_instance_id ?? ""}`;
}

function isAllDayString(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function formatDateTime(isoOrDate: string) {
  if (isAllDayString(isoOrDate)) return isoOrDate;
  const d = new Date(isoOrDate);
  return d.toLocaleString();
}

function useIsMobile(breakpointPx = 768) {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpointPx]);

  return isMobile;
}

function loadSavedTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem("events_theme") === "dark" ? "dark" : "light";
}

function saveTheme(theme: Theme) {
  window.localStorage.setItem("events_theme", theme);
}

/**
 * Extract a single details URL from the Google Calendar description.
 * Handles raw URLs, <a href="...">, and percent-encoded HTML artifacts.
 */
function extractDetailsUrl(description: string | null): string | null {
  if (!description) return null;

  let text = description.trim();
  if (!text) return null;

  // Prefer href="..." if present
  const hrefMatch = text.match(/href\s*=\s*["']([^"']+)["']/i);
  if (hrefMatch?.[1]) return sanitizeUrl(hrefMatch[1]);

  // If it looks percent-encoded, try decoding once
  if (/%3C|%3E|%22|%27/i.test(text)) {
    try {
      const decoded = decodeURIComponent(text);
      const decodedHref = decoded.match(/href\s*=\s*["']([^"']+)["']/i);
      if (decodedHref?.[1]) return sanitizeUrl(decodedHref[1]);
      text = decoded;
    } catch {
      // ignore decode errors
    }
  }

  // Extract first URL
  const urlMatch = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!urlMatch?.[0]) return null;

  return sanitizeUrl(urlMatch[0]);
}

function sanitizeUrl(raw: string): string | null {
  if (!raw) return null;
  let u = raw.trim();

  // Strip surrounding quotes
  u = u.replace(/^["']+/, "").replace(/["']+$/, "");

  // If multiple http segments appear, keep only the first one
  const lower = u.toLowerCase();
  const firstHttp = lower.indexOf("http");
  const secondHttp = lower.indexOf("http", firstHttp + 1);
  if (firstHttp >= 0 && secondHttp > firstHttp) {
    u = u.slice(firstHttp, secondHttp);
  }

  // Cut off common junk markers (encoded quotes/tags)
  const cutMarkers = ["%22", "%27", "%3C", "%3E", '"', "'", "<", ">"];
  for (const m of cutMarkers) {
    const idx = u.indexOf(m);
    if (idx > -1) u = u.slice(0, idx);
  }

  u = u.trim();
  if (!/^https?:\/\//i.test(u)) return null;
  return u;
}

function getDetailsCtaLabel(url: string): string {
  let host = "";
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return "Click here to view details";
  }

  const isInstagram = host === "instagram.com" || host.endsWith(".instagram.com");
  const isFacebook = host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com";
  const isEventbrite = host === "eventbrite.com" || host.endsWith(".eventbrite.com");

  if (isInstagram) return "View on Instagram";
  if (isFacebook) return "View on Facebook";
  if (isEventbrite) return "View on Eventbrite";
  return "Click here to view details";
}

function isValidEmail(email: string) {
  const e = email.trim().toLowerCase();
  if (!e.includes("@")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function clampStr(s: string) {
  return s.trim();
}

/** Focus trap inside a modal container */
function useFocusTrap(
  isOpen: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  onEscape: () => void
) {
  useEffect(() => {
    if (!isOpen) return;

    const el = containerRef.current;
    if (!el) return;

    const getFocusable = () =>
      Array.from(
        el.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((n) => !n.hasAttribute("disabled") && !n.getAttribute("aria-hidden"));

    const focusables = getFocusable();
    (focusables[0] ?? el).focus?.();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key !== "Tab") return;

      const items = getFocusable();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, containerRef, onEscape]);
}

export default function EventsPage() {
  const isMobile = useIsMobile(768);

  const [theme, setTheme] = useState<Theme>("light");
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [calendarInitialView, setCalendarInitialView] = useState<"dayGridMonth" | "timeGridWeek">("dayGridMonth");

  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ApiEvent | null>(null);

  const [toasts, setToasts] = useState<Toast[]>([]);

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTheme(loadSavedTheme());
  }, []);

  useEffect(() => {
    if (isMobile === null) return;
    if (isMobile) {
      setViewMode("list");
      setCalendarInitialView("timeGridWeek");
    } else {
      setViewMode("calendar");
      setCalendarInitialView("dayGridMonth");
    }
  }, [isMobile]);

  useFocusTrap(!!selected, modalRef, () => setSelected(null));

  useEffect(() => {
    if (!selected) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selected]);

  const sortedUpcoming = useMemo(() => {
    const now = Date.now();
    return [...events]
      .filter((e) => {
        const start = isAllDayString(e.start) ? new Date(e.start + "T00:00:00") : new Date(e.start);
        return start.getTime() >= now - 1000 * 60 * 60 * 24;
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [events]);

  async function fetchEvents(rangeStart: Date, rangeEnd: Date) {
    setLoading(true);
    setLoadError(null);
    try {
      const url = `/api/events?start=${encodeURIComponent(toIsoZ(rangeStart))}&end=${encodeURIComponent(
        toIsoZ(rangeEnd)
      )}`;
      const resp = await fetch(url, { cache: "no-store" });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Failed to load events");
      setEvents(data.events ?? []);
    } catch (err: any) {
      setLoadError(err?.message ?? "Failed to load events");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  function onEventClick(arg: EventClickArg) {
    const ext = arg.event.extendedProps as any;
    const e: ApiEvent | undefined = ext.__apiEvent;
    if (e) setSelected(e);
  }

  function toggleTheme() {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      saveTheme(next);
      return next;
    });
  }

  function pushToast(t: Omit<Toast, "id">, ttlMs = 3500) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const toast: Toast = { id, ...t };
    setToasts((prev) => [...prev, toast]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, ttlMs);
  }

  const btnBase =
    "cursor-pointer select-none rounded-xl border border-[var(--control-border)] bg-[var(--control)] " +
    "px-3 py-2 text-sm font-semibold text-[var(--text)] " +
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.35),_0_1px_2px_rgba(0,0,0,0.12)] " +
    "transition-transform transition-shadow transition-colors duration-150 " +
    "hover:bg-[var(--control-hover)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.45),_0_3px_10px_rgba(0,0,0,0.14)] " +
    "active:translate-y-[1px] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.18)] " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-[var(--page)]";

  const btnActive = "bg-[var(--control-hover)] shadow-[inset_0_2px_6px_rgba(0,0,0,0.18)]";

  const btnAccent =
    "cursor-pointer select-none rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-extrabold " +
    "text-[var(--accent-text)] border border-[var(--accent)] " +
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.25),_0_2px_10px_rgba(0,0,0,0.18)] " +
    "transition-transform transition-shadow transition-colors duration-150 " +
    "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),_0_4px_16px_rgba(0,0,0,0.22)] " +
    "active:translate-y-[1px] active:shadow-[inset_0_2px_6px_rgba(0,0,0,0.25)] " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-[var(--page)] disabled:opacity-60 disabled:cursor-not-allowed";

  const cardBase =
    "rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 " +
    "shadow-[0_1px_2px_rgba(0,0,0,0.10)]";

  const clickableCard =
    "cursor-pointer " +
    cardBase +
    " transition-transform transition-shadow duration-150 " +
    "hover:shadow-[0_6px_18px_rgba(0,0,0,0.14)] hover:-translate-y-[1px] " +
    "active:translate-y-0 active:shadow-[0_3px_10px_rgba(0,0,0,0.12)]";

  const inputClass =
    "rounded-xl border border-[var(--control-border)] bg-[var(--control)] px-3 py-2 text-sm text-[var(--text)] outline-none " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-[var(--page)]";

  return (
    <div data-theme={theme} className="min-h-screen bg-[var(--page)] text-[var(--text)]">
      <style>{`
        .fc {
          --fc-page-bg-color: var(--surface);
          --fc-border-color: var(--border);
          --fc-neutral-bg-color: var(--surface);
          --fc-today-bg-color: ${theme === "dark" ? "rgba(37, 99, 235, 0.18)" : "rgba(37, 99, 235, 0.10)"};
          --fc-list-event-hover-bg-color: ${theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"};

          --fc-neutral-text-color: var(--muted);
          --fc-button-text-color: var(--text);
          --fc-button-bg-color: var(--control);
          --fc-button-border-color: var(--control-border);
          --fc-button-hover-bg-color: var(--control-hover);
          --fc-button-hover-border-color: var(--control-border);
          --fc-button-active-bg-color: var(--control-hover);
          --fc-button-active-border-color: var(--control-border);
        }
        .fc .fc-toolbar-title { color: var(--text); }
        .fc .fc-col-header-cell-cushion { color: var(--text); }
        .fc .fc-daygrid-day-number { color: var(--muted); }
        .fc .fc-timegrid-slot-label-cushion { color: var(--muted); }
        .fc .fc-event { cursor: pointer !important; }

        .fc .fc-event {
          background-color: var(--accent) !important;
          border-color: var(--accent) !important;
        }
        .fc .fc-event .fc-event-title,
        .fc .fc-event .fc-event-time {
          color: var(--accent-text) !important;
        }
      `}</style>

      {/* Toasts */}
      <div className="fixed right-4 top-4 z-[60] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface2)] p-3 shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-extrabold">
                  {t.kind === "success" ? "✅ " : t.kind === "error" ? "⚠️ " : "ℹ️ "}
                  {t.title}
                </div>
                {t.message && <div className="mt-1 text-sm text-[var(--muted)]">{t.message}</div>}
              </div>
              <button
                className={`${btnBase} !px-2 !py-1`}
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                aria-label="Dismiss toast"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-5xl p-4">
        <header className={`${cardBase} flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-3">
            <h1 className="m-0 text-xl font-extrabold">Events</h1>

            <button onClick={toggleTheme} className={btnBase} aria-label="Toggle theme">
              {theme === "dark" ? "Dark" : "Light"}
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setViewMode("list")} className={`${btnBase} ${viewMode === "list" ? btnActive : ""}`}>
              List
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`${btnBase} ${viewMode === "calendar" ? btnActive : ""}`}
            >
              Calendar
            </button>
          </div>
        </header>

        <div className="mt-3">
          {loading && viewMode === "calendar" && <div className="mb-2 text-sm text-[var(--muted)]">Loading…</div>}
          {loadError && <div className="mb-2 text-sm text-[var(--danger)]">{loadError}</div>}
        </div>

        {viewMode === "calendar" ? (
          <div className={`${cardBase} mt-3`}>
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView={calendarInitialView}
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: isMobile ? "timeGridWeek,timeGridDay" : "dayGridMonth,timeGridWeek,timeGridDay",
              }}
              height="auto"
              nowIndicator
              selectable={false}
              events={events.map((e) => ({
                id: eventKey(e),
                title: e.attendeeCount != null ? `${e.title} (${e.attendeeCount})` : e.title,
                start: e.start,
                end: e.end,
                extendedProps: { __apiEvent: e },
              }))}
              eventClick={onEventClick}
              datesSet={(arg) => fetchEvents(arg.start, arg.end)}
            />

            {isMobile && <div className="mt-2 text-xs text-[var(--muted)]">Tip: Week/Day views are easier on mobile.</div>}
          </div>
        ) : (
          <div className="mt-3">
            {loading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className={cardBase}>
                    <div className="skeleton h-4 w-2/3"></div>
                    <div className="mt-3 space-y-2">
                      <div className="skeleton h-3 w-1/2"></div>
                      <div className="skeleton h-3 w-1/3"></div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <div className="skeleton h-9 w-28"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : sortedUpcoming.length === 0 ? (
              <div className={`${cardBase} text-sm text-[var(--muted)]`}>No upcoming events in this range.</div>
            ) : (
              <div className="flex flex-col gap-3">
                {sortedUpcoming.map((e) => (
                  <div
                    key={eventKey(e)}
                    className={`${clickableCard} flex items-start justify-between gap-3`}
                    onClick={() => setSelected(e)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") setSelected(e);
                    }}
                    aria-label={`Open event ${e.title}`}
                  >
                    <div className="min-w-0">
                      <div className="font-extrabold">{e.title}</div>
                      <div className="mt-1 text-sm text-[var(--muted)]">
                        {formatDateTime(e.start)} {e.end ? `– ${formatDateTime(e.end)}` : ""}
                      </div>
                      {e.location && <div className="mt-1 text-sm text-[var(--muted)]">{e.location}</div>}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {e.attendeeCount != null && <div className="text-sm text-[var(--muted)]">{e.attendeeCount} going</div>}
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setSelected(e);
                        }}
                        className={btnBase}
                      >
                        View / RSVP
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && events.length === 0 && !loadError && (
              <button
                onClick={() => {
                  const start = new Date();
                  const end = new Date();
                  end.setDate(end.getDate() + 60);
                  fetchEvents(start, end);
                }}
                className={`${btnBase} mt-3`}
              >
                Load next 60 days
              </button>
            )}
          </div>
        )}

        {selected && (
          <div
            onMouseDown={() => setSelected(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          >
            <div
              ref={modalRef}
              onMouseDown={(e) => e.stopPropagation()}
              className="w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--surface2)] p-4 text-[var(--text)] shadow-2xl outline-none"
              role="dialog"
              aria-modal="true"
              aria-label="Event details"
              tabIndex={-1}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-extrabold">{selected.title}</div>
                  <div className="mt-1 text-sm text-[var(--muted)]">
                    {formatDateTime(selected.start)} {selected.end ? `– ${formatDateTime(selected.end)}` : ""}
                  </div>
                  {selected.location && <div className="text-sm text-[var(--muted)]">{selected.location}</div>}
                  {selected.attendeeCount != null && (
                    <div className="mt-1 text-sm text-[var(--muted)]">{selected.attendeeCount} going</div>
                  )}
                </div>

                <button onClick={() => setSelected(null)} className={`${btnBase} !px-2 !py-1`} aria-label="Close modal">
                  ✕
                </button>
              </div>

              {(() => {
                const detailsUrl = extractDetailsUrl(selected.description);
                if (!detailsUrl) return null;

                const label = getDetailsCtaLabel(detailsUrl);
                const openInNewTab = isMobile === false;
                const target = openInNewTab ? "_blank" : undefined;

                return (
                  <a
                    href={detailsUrl}
                    target={target}
                    rel={openInNewTab ? "noopener noreferrer" : undefined}
                    className={`${btnAccent} mt-4 inline-block`}
                  >
                    {label}
                  </a>
                );
              })()}

              <div className="mt-4 border-t border-[var(--border)] pt-3">
                <div className="mb-2 font-extrabold">RSVP</div>

                <RSVPForm
                  event={{
                    google_event_id: selected.google_event_id,
                    recurring_instance_id: selected.recurring_instance_id,
                  }}
                  inputClass={inputClass}
                  btnAccent={btnAccent}
                  toast={(t) => pushToast(t)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RSVPForm({
  event,
  inputClass,
  btnAccent,
  toast,
}: {
  event: { google_event_id: string; recurring_instance_id: string | null };
  inputClass: string;
  btnAccent: string;
  toast: (t: Omit<Toast, "id">) => void;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"going" | "maybe">("going");
  const [submitting, setSubmitting] = useState(false);

  const emailOk = isValidEmail(email);
  const canSubmit = emailOk && !submitting;

  const segBase =
    "cursor-pointer select-none rounded-xl border border-[var(--control-border)] bg-[var(--control)] " +
    "px-3 py-2 text-sm font-semibold text-[var(--text)] " +
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.35),_0_1px_2px_rgba(0,0,0,0.12)] " +
    "transition-transform transition-shadow transition-colors duration-150 " +
    "hover:bg-[var(--control-hover)] active:translate-y-[1px] " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-[var(--page)]";

  const segActive = "bg-[var(--control-hover)] shadow-[inset_0_2px_6px_rgba(0,0,0,0.18)]";

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      const resp = await fetch("/api/rsvp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          google_event_id: event.google_event_id,
          recurring_instance_id: event.recurring_instance_id,
          email: clampStr(email).toLowerCase(),
          status,
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Failed to RSVP");

      toast({
        kind: "success",
        title: "RSVP saved",
        message: "Check your email soon to confirm (next step).",
      });

      setEmail("");
      setStatus("going");
    } catch (e: any) {
      toast({
        kind: "error",
        title: "Couldn’t save RSVP",
        message: e?.message || "Something went wrong",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-2 text-sm font-extrabold">Your RSVP</div>
        <div className="inline-flex gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2">
          <button
            type="button"
            onClick={() => setStatus("going")}
            className={`${segBase} ${status === "going" ? segActive : ""}`}
            aria-pressed={status === "going"}
          >
            Going
          </button>
          <button
            type="button"
            onClick={() => setStatus("maybe")}
            className={`${segBase} ${status === "maybe" ? segActive : ""}`}
            aria-pressed={status === "maybe"}
          >
            Maybe
          </button>
        </div>
        <div className="mt-2 text-xs text-[var(--muted)]">You’ll confirm by email next.</div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            inputMode="email"
            className={inputClass}
            aria-invalid={!emailOk && email.length > 0 ? true : undefined}
          />
          {!emailOk && email.length > 0 && (
            <div className="mt-1 text-xs text-[var(--muted)]">Enter a valid email address.</div>
          )}
        </div>
      </div>

      <button onClick={submit} disabled={!canSubmit} className={btnAccent}>
        {submitting ? "Submitting…" : status === "going" ? "RSVP Going" : "RSVP Maybe"}
      </button>
    </div>
  );
