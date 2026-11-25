const { assert, test, load } = require('../security/helpers.cjs');
const React = require('react');

const button = 'Button';
const menuItem = 'DropdownMenuItem';
const stubs = names => Object.fromEntries(names.map(name => [name, name]));

function* elements(node) {
  if (Array.isArray(node)) {
    for (const child of node) yield* elements(child);
  } else if (React.isValidElement(node)) {
    yield node;
    yield* elements(node.props.children);
  }
}

function clickCardActions(status) {
  const destinations = [];
  const { default: WorkspaceAppsManager } = load('src/components/apps/WorkspaceAppsManager.tsx', {
    react: { useState: initial => [initial, () => {}] },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { useRouter: () => ({ push: address => destinations.push(address) }) },
    'next/image': { default: 'img' },
    'lucide-react': require('lucide-react'),
    sonner: {},
    '@/components/ui/card': stubs(['Card', 'CardContent', 'CardDescription', 'CardHeader', 'CardTitle']),
    '@/components/ui/button': stubs([button]),
    '@/components/ui/badge': stubs(['Badge']),
    '@/components/ui/dropdown-menu': stubs(['DropdownMenu', 'DropdownMenuContent', menuItem, 'DropdownMenuSeparator', 'DropdownMenuTrigger']),
    '@/components/ui/alert-dialog': stubs(['AlertDialog', 'AlertDialogAction', 'AlertDialogCancel', 'AlertDialogContent',
      'AlertDialogDescription', 'AlertDialogFooter', 'AlertDialogHeader', 'AlertDialogTitle']),
  });

  const tree = WorkspaceAppsManager({
    workspaceId: 'workspace-id',
    workspaceSlug: 'alpha-team',
    installedApps: [{
      id: 'installation',
      status: 'ACTIVE',
      app: { slug: 'calendar-sync', name: 'Calendar Sync', status },
      webhooks: [],
    }],
  });

  for (const { type, props } of elements(tree)) {
    if (type === button || type === menuItem) props.onClick?.();
  }
  return destinations;
}

test('the installed card and its overflow menu navigate only to the workspace app page', () => {
  const appPage = '/alpha-team/apps/calendar-sync';
  assert.deepEqual(clickCardActions('PUBLISHED'), [appPage, appPage]);
});

test('an unpublished app with an active installation has no launch destination', () => {
  for (const status of ['DRAFT', 'SUSPENDED']) {
    assert.deepEqual(clickCardActions(status), [], status);
  }
});
