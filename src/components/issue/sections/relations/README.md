# Issue Relations System

A comprehensive, modular relations system for Issues that supports various relationship types with Linear-style UI and robust search functionality.

## Structure

```
relations/
├── components/          # UI components
│   ├── RelationItem.tsx           # Individual relation display (Linear-style)
│   ├── RelationGroup.tsx          # Group of relations by type
│   ├── AddRelationModal.tsx       # Search and add relations modal
│   ├── SearchRelationItem.tsx     # Search result item component
│   ├── EmptyRelationsState.tsx    # Empty state display
│   └── LoadingState.tsx           # Loading spinner
├── hooks/              # Custom React hooks
│   ├── useIssueRelations.ts       # Fetch relations data
│   ├── useRelationMutations.ts    # Add/remove relations
│   └── useRelationSearch.ts       # Search for items to relate
├── types/              # TypeScript definitions
│   └── relation.ts                # All relation interfaces
├── utils/              # Utility functions
│   ├── relationConfig.ts          # Relation type configurations
│   └── relationHelpers.ts         # Helper functions for relations
├── IssueRelationsSection.tsx      # Main component
└── index.ts            # Clean exports
```

## Supported Relation Types

### Core Relations
- **Parent/Child**: Hierarchical relationships (parent issue → sub-issues)
- **Blocks/Blocked by**: Dependency relationships
- **Related**: General associations between issues
- **Duplicates/Duplicated by**: Duplicate issue tracking

### Supported Item Types
- **Issues**: Primary type using new issue model
- **Epics**: Legacy epic items (will be migrated to issues)
- **Stories**: Legacy story items (will be migrated to issues) 
- **Tasks**: Legacy task items (will be migrated to issues)
- **Milestones**: Legacy milestone items (will be migrated to issues)

## Features

### ✨ Modern UI/UX
- **Linear-style Interface**: Clean, compact design inspired by Linear.app
- **Hover Effects**: Smooth transitions and interactive feedback
- **Responsive Layout**: Works on all screen sizes
- **Consistent Styling**: Matches ListView renderer design patterns

### 🔍 Advanced Search
- **Real-time Search**: Search as you type with debouncing
- **Multi-type Filtering**: Filter by item type, status, assignee, project
- **Smart Exclusions**: Automatically excludes current item and existing relations
- **Bulk Selection**: Add multiple relations at once

### 🚀 Robust Functionality
- **Optimistic Updates**: Immediate UI feedback with error handling
- **Smart Validation**: Prevents invalid relationships and circular dependencies
- **Efficient Caching**: React Query for optimal data management
- **API Integration**: Full CRUD operations with proper error handling

### 📱 Accessibility
- **Keyboard Navigation**: Full keyboard support for modal and selection
- **Screen Reader**: Proper ARIA labels and semantic HTML
- **Focus Management**: Logical focus flow and visual indicators

## Usage

### Basic Implementation
```tsx
import { IssueRelationsSection } from "@/components/issue/sections/relations";

<IssueRelationsSection
  issue={issue}
  workspaceId={workspaceId}
  currentUserId={currentUser.id}
  onRefresh={handleRefresh}
/>
```

### Individual Components
```tsx
import { RelationItem, AddRelationModal } from "@/components/issue/sections/relations";

// Display a single relation
<RelationItem
  item={relationItem}
  workspaceId={workspaceId}
  relationType="child"
  onRemove={handleRemove}
  canRemove={true}
  compact={false} // Use Linear-style full layout
/>

// Add relation modal
<AddRelationModal
  isOpen={isOpen}
  onClose={handleClose}
  onAdd={handleAdd}
  relationType="child"
  workspaceId={workspaceId}
  currentIssueId={issue.id}
  excludeIds={existingRelationIds}
/>
```

## API Requirements

### Backend Endpoints

#### Get Relations
```
GET /api/issues/{issueId}/relations
Response: {
  relations: [
    {
      id: string,
      relationType: 'parent' | 'child' | 'blocks' | 'blocked_by' | 'relates_to' | 'duplicates' | 'duplicated_by',
      relatedItem: {
        id: string,
        title: string,
        issueKey?: string,
        status?: string,
        priority?: string,
        type: 'issue' | 'epic' | 'story' | 'task' | 'milestone',
        assignee?: User,
        project?: Project,
        // ... other fields
      }
    }
  ]
}
```

#### Add Relation
```
POST /api/issues/{issueId}/relations
Body: {
  relatedItemId: string,
  relationType: RelationType
}
```

#### Add Multiple Relations
```
POST /api/issues/{issueId}/relations/bulk
Body: {
  relations: Array<{
    relatedItemId: string,
    relationType: RelationType
  }>
}
```

#### Remove Relation
```
DELETE /api/issues/{issueId}/relations/{relatedItemId}
Body: {
  relationType: RelationType
}
```

#### Search Items
```
GET /api/workspaces/{workspaceId}/items/search?q={query}&types={types}&statuses={statuses}&exclude={ids}
Response: {
  items: RelationItem[]
}
```

## Migration from Legacy System

This system replaces the old task-based relations and sub-issues:

### Deprecated Components
- `IssueSubIssuesSection` → Use `IssueRelationsSection` with `child` relation type
- Old task relations → Will be migrated to issue relations

### Migration Path
1. **Phase 1**: Issue relations system (current)
2. **Phase 2**: Migrate existing task/epic/story relations to issue relations
3. **Phase 3**: Deprecate legacy task/epic/story models
4. **Phase 4**: Full issue-centric workflow

## Customization

### Styling
The system uses consistent styling with the rest of the application:
- Dark theme with `#0a0a0a` backgrounds
- `#1f1f1f` borders for subtle separation
- `#e1e7ef` primary text color
- `#8b949e` secondary text color
- Hover states with `#0d0d0d` backgrounds

### Relation Types
Add new relation types by:
1. Extending `IssueRelationType` in `types/relation.ts`
2. Adding configuration in `utils/relationConfig.ts`
3. Updating the display order in `IssueRelationsSection.tsx`

### Search Filters
Extend search functionality by:
1. Adding new filter types to `RelationSearchFilters`
2. Updating the search hook in `hooks/useRelationSearch.ts`
3. Adding UI controls in `AddRelationModal.tsx`

## Future Enhancements

- **Real-time Collaboration**: Live updates when relations change
- **Relation History**: Track changes and show audit trail
- **Bulk Operations**: Select and modify multiple relations
- **Advanced Visualizations**: Relation graphs and dependency trees
- **Smart Suggestions**: AI-powered relation recommendations
- **Integration**: Sync with external tools and services
