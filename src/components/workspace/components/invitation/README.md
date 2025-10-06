# Invitation Components

This folder contains modular components for workspace invitation functionality, following Next.js best practices for code splitting and component organization. All components use TanStack Query for data fetching and automatic cache invalidation.

## Components

### `InvitationsTab`
The main container component that renders the entire invitations tab content. It handles permission checking, data fetching, and renders the appropriate child components.

**Props:**
- `workspaceId: string` - The workspace identifier
- `canInviteMembers: boolean` - Permission flag for invitation functionality

**Features:**
- Automatically fetches invitation data using TanStack Query
- Shows loading and error states
- Handles real-time updates via query invalidation

### `PendingInvitations`
Displays a list of pending invitations with the ability to cancel them.

**Props:**
- `invitations: Invitation[]` - Array of pending invitations
- `workspaceId: string` - The workspace identifier
- `canCancelInvitations: boolean` - Permission flag for canceling invitations

### `InviteNewMembers`
Contains the form for sending new invitations to workspace members.

**Props:**
- `workspaceId: string` - The workspace identifier

### `InviteMemberForm`
A form component for sending invitations with TanStack Query integration.

**Props:**
- `workspaceId: string` - The workspace identifier
- `onInviteSent?: () => void` - Optional callback when invitation is sent

**Features:**
- Uses `useInviteMember` mutation for sending invitations
- Automatic error handling and success notifications
- Form validation with Zod schema
- Automatic query invalidation on success

### `CancelInvitationButton`
A button component for canceling invitations with confirmation dialog.

**Props:**
- `invitationId: string` - The invitation identifier
- `workspaceId: string` - The workspace identifier
- `onSuccess?: () => void` - Optional callback on successful cancellation

**Features:**
- Uses `useCancelInvitation` mutation for canceling invitations
- Confirmation dialog for user safety
- Automatic error handling and success notifications
- Automatic query invalidation on success

## Hooks

### `useInvitations(workspaceId: string)`
Fetches invitations for a workspace using TanStack Query.

**Returns:**
- `data: Invitation[]` - Array of invitations
- `isLoading: boolean` - Loading state
- `error: Error | null` - Error state
- Standard TanStack Query return values

### `useInviteMember(workspaceId: string)`
Mutation hook for sending invitations.

**Returns:**
- `mutate: (email: string) => void` - Mutation function
- `mutateAsync: (email: string) => Promise<any>` - Async mutation function
- `isPending: boolean` - Loading state
- `error: Error | null` - Error state
- Standard TanStack Query mutation return values

### `useCancelInvitation(workspaceId: string)`
Mutation hook for canceling invitations.

**Returns:**
- `mutate: (invitationId: string) => void` - Mutation function
- `mutateAsync: (invitationId: string) => Promise<any>` - Async mutation function
- `isPending: boolean` - Loading state
- `error: Error | null` - Error state
- Standard TanStack Query mutation return values

## Query Keys

The hooks use a consistent query key factory:

```typescript
export const invitationKeys = {
  all: ['invitations'] as const,
  workspace: (workspaceId: string) => [...invitationKeys.all, 'workspace', workspaceId] as const,
};
```

## Types

All TypeScript interfaces are defined in `types.ts` for better type safety and reusability:

- `Invitation` - Interface for invitation data structure
- `InvitationComponentProps` - Base props for invitation components
- `PendingInvitationsProps` - Props for PendingInvitations component
- `InvitationsTabProps` - Props for InvitationsTab component

## Usage

```tsx
import { InvitationsTab } from '@/components/workspace/components/invitation';

// In your component
<InvitationsTab
  workspaceId={workspaceId}
  canInviteMembers={canInviteMembers}
/>
```

## Benefits

1. **Real-time Updates**: Automatic query invalidation ensures the UI stays in sync
2. **Optimistic Updates**: Immediate UI feedback with server reconciliation
3. **Error Handling**: Comprehensive error states and user feedback
4. **Performance**: Efficient caching and background refetching
5. **Modularity**: Each component has a single responsibility
6. **Reusability**: Components can be used independently if needed
7. **Type Safety**: Shared TypeScript interfaces ensure consistency
8. **Maintainability**: Easier to test, debug, and modify individual components
9. **Developer Experience**: Clear component boundaries and comprehensive documentation

## Query Invalidation Strategy

The hooks automatically invalidate related queries on successful mutations:

- **On Invite Success**: Invalidates `invitations` and `workspace` queries
- **On Cancel Success**: Invalidates `invitations` and `workspace` queries

This ensures that:
- The invitation list updates immediately
- Workspace member counts are refreshed
- All related UI components stay synchronized
