# Issue Comments Section

A modular comment system for issue discussions with support for nested replies, reactions, and rich text editing.

## Structure

```
comments/
├── components/          # UI components
│   ├── CommentItem.tsx         # Individual comment display
│   ├── CommentForm.tsx         # New comment creation
│   ├── CommentReplyForm.tsx    # Reply to existing comments
│   ├── CommentActions.tsx      # Like, reply, edit, delete actions
│   ├── EmptyCommentsState.tsx  # Empty state display
│   └── LoadingState.tsx        # Loading spinner
├── hooks/              # (Removed - now uses centralized hooks)
│   # All hooks moved to @/hooks/queries/useIssueComment.ts
├── types/              # TypeScript definitions
│   └── comment.ts              # Comment interfaces
├── utils/              # Utility functions
│   └── commentHelpers.ts       # Comment organization & helpers
├── IssueCommentsSection.tsx    # Main component
└── index.ts            # Clean exports
```

## Features

- **Nested Comments**: Support for threaded conversations with replies
- **Rich Text**: Full rich text editing with AI improvements
- **Reactions**: Like/unlike comments (expandable for more reaction types)
- **Real-time Updates**: Optimistic updates with React Query
- **Responsive Design**: Compact layout optimized for various screen sizes
- **Accessibility**: Keyboard navigation and screen reader support

## Usage

```tsx
import { IssueCommentsSection } from "@/components/issue/sections/comments";

<IssueCommentsSection
  issueId="issue-123"
  currentUserId="user-456"
  workspaceId="workspace-789"
  initialComments={[]} // Optional initial data
/>
```

## Component Breakdown

### Main Components
- **IssueCommentsSection**: Main orchestrator component
- **CommentItem**: Renders individual comments with replies
- **CommentForm**: Form for adding new top-level comments
- **CommentReplyForm**: Form for replying to existing comments

### Supporting Components
- **CommentActions**: Action buttons (like, reply, edit, delete)
- **EmptyCommentsState**: Shows when no comments exist
- **LoadingState**: Loading spinner during data fetch

### Hooks
All hooks have been moved to centralized location `@/hooks/queries/useIssueComment.ts`:
- **useIssueComments**: Fetches and manages comment data
- **useAddIssueComment**: Handles comment creation with optimistic updates
- **useUpdateIssueComment**: Handles comment editing with optimistic updates
- **useDeleteIssueComment**: Handles comment deletion with optimistic updates
- **useToggleIssueCommentLike**: Handles comment likes with optimistic updates

### Utilities
- **organizeCommentsIntoTree**: Converts flat comment list to nested structure
- **hasUserLikedComment**: Checks if user has liked a comment
- **getLikeCount**: Gets total like count for a comment

## Future Enhancements

- Edit/delete comment functionality
- More reaction types (thumbs up/down, emojis)
- Comment moderation features
- Real-time collaboration indicators
- Comment search and filtering
- Markdown shortcuts support
