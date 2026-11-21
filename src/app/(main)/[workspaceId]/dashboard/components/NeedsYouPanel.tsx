import type { NeedsYouKind, NeedsYouOverview } from '@/types/workspace-dashboard';

export default function NeedsYouPanel(_props: {
  data: NeedsYouOverview;
  kind?: NeedsYouKind;
  kindHrefs: Record<NeedsYouKind | 'all', string>;
  workspaceSlug: string;
  now: string;
}) {
  return null;
}
