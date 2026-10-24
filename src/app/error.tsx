"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card error">
      <h1>Couldn&apos;t reach Sleeper</h1>
      <p className="muted">{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
