export default function LoadingIssue() {
  return <div role="status" aria-label="Loading issue" className="grid grid-cols-1 gap-8 p-4 md:p-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
    <div className="space-y-6">
      <div className="h-9 w-3/4 animate-pulse rounded-lg bg-collab-800" />
      <div className="h-6 w-1/3 animate-pulse rounded-lg bg-collab-800" />
      <div className="h-64 animate-pulse rounded-xl bg-collab-800" />
    </div>
    <div className="space-y-4">
      {[0, 1, 2, 3, 4, 5].map(row => <div key={row} className="h-12 animate-pulse rounded-lg bg-collab-800" />)}
    </div>
    <span className="sr-only">Loading issue</span>
  </div>;
}
