export default function LoadingView() {
  return <div role="status" aria-label="Loading view" className="space-y-6 p-4 md:p-8">
    <div className="h-12 animate-pulse rounded-xl bg-collab-800" />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map(column => <div key={column} className="h-72 animate-pulse rounded-xl bg-collab-800" />)}
    </div>
    <span className="sr-only">Loading view</span>
  </div>;
}
