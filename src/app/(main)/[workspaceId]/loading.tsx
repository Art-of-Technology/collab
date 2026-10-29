export default function LoadingWorkspace() {
  return <div role="status" aria-label="Loading" className="space-y-6 p-4 md:p-8">
    <div className="h-10 w-64 animate-pulse rounded-lg bg-collab-800" />
    <div className="h-72 animate-pulse rounded-xl bg-collab-800" />
    <span className="sr-only">Loading</span>
  </div>;
}
