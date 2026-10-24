import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card error">
      <h1>Not found</h1>
      <p className="muted">Sleeper doesn&apos;t know that username or league. Check the spelling and try again.</p>
      <Link href="/">Back to search</Link>
    </div>
  );
}
