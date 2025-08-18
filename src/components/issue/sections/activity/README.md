# Issue Activity Section

A modular and elegant activity tracking system for issues, designed with Linear.app inspiration and following the project's subtle, compact design language.

## Features

- **Clean, Compact Design**: Subtle colors and minimal spacing for an elegant look
- **HTML Content Processing**: Properly handles and displays formatted content from description updates
- **Modular Architecture**: Well-organized components for maintainability
- **Real-time Updates**: Hooks for fetching and managing activity data
- **Activity Filtering**: Intelligent filtering to avoid redundant activity entries
- **Linear.app Inspired**: Modern design patterns inspired by Linear's clean interface

## Structure

```
activity/
├── components/
│   ├── ActivityChangeDetails.tsx    # Displays from/to changes
│   ├── ActivityIcon.tsx            # Action-specific icons
│   ├── ActivityItem.tsx            # Individual activity entry
│   ├── EmptyActivityState.tsx      # Empty state component
│   ├── IssueActivitySection.tsx    # Main section component
│   └── LoadingState.tsx           # Loading skeleton
├── hooks/
│   └── useIssueActivities.ts      # Activity data fetching
├── types/
│   └── activity.ts               # TypeScript interfaces
└── utils/
    └── activityHelpers.ts        # Utility functions
```

## Key Improvements

1. **Fixed HTML Display**: Raw HTML content is now properly parsed and displayed as clean text
2. **Subtle Design**: Matches the project's compact design language with muted colors
3. **Modular Components**: Clean separation of concerns for better maintainability
4. **Type Safety**: Comprehensive TypeScript types for all components
5. **Performance**: Optimized rendering with intelligent activity filtering

## Usage

```tsx
import { IssueActivitySection } from "./activity";

<IssueActivitySection issueId={issueId} limit={50} />
```

## Design System

- **Colors**: Subtle grays (`#c9d1d9`, `#7d8590`, `#666`) for text hierarchy
- **Spacing**: Compact spacing with `py-1.5`, `gap-2.5` for density
- **Interactions**: Subtle hover effects with `hover:bg-[#0d0d0d]`
- **Typography**: Small text sizes (`text-xs`, `text-[10px]`) for compactness
- **Icons**: Small 3x3 icons with semantic colors for different activity types
