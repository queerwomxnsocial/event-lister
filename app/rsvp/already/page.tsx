// app/rsvp/already/page.tsx
import { Suspense } from "react";
import AlreadyClient from "./ui"

export default function AlreadyPage() {
  return (
    <Suspense fallback={<main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>Loading…</main>}>
      <AlreadyClient />
    </Suspense>
  );
}