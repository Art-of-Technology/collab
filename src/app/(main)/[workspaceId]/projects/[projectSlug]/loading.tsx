export default function LoadingProject() {
  return <div role="status" aria-label="Loading project" className="space-y-6 p-4 md:p-8">
    <div className="h-20 animate-pulse rounded-xl bg-collab-800" />
    <div className="h-72 animate-pulse rounded-xl bg-collab-800" />
    <span className="sr-only">Loading project</span>
  </div>;
}
