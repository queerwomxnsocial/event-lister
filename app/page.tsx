import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white px-6">
      <div className="text-center">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight">
          Queer Women Social
        </h1>

        <div className="mt-8">
          <Link
            href="/events"
            className="inline-block rounded-2xl bg-white px-6 py-3 text-base sm:text-lg font-semibold text-black shadow-lg transition hover:scale-105 active:scale-100"
          >
            Click to view events
          </Link>
        </div>
      </div>
    </main>
  );
}