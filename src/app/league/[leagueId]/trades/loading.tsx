export default function Loading() {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h1 style={{ marginTop: 0 }}>Finding trades…</h1>
      <div className="spinner" aria-hidden />
      <p className="muted">
        Pulling rest-of-season projections and testing every 1-for-1, 2-for-1 and 1-for-2 trade
        in your league. This can take up to 30 seconds the first time.
      </p>
    </div>
  );
}
