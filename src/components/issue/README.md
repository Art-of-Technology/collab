# Unified Issue Components

Modern, Linear.app-style React components for the unified Issue model. These components replace the complex TaskDetailContent, EpicDetailContent, and related components with a clean, modular architecture.

## 🎨 Design Philosophy

- **Linear.app-inspired**: Clean, minimal design with subtle gradients and smooth animations
- **Modular**: Each component has a single responsibility
- **Consistent**: Unified design language across all issue types (Epic, Story, Task, Defect, Milestone, Subtask)
- **Accessible**: Proper ARIA labels, keyboard navigation, and semantic HTML
- **Type-safe**: Full TypeScript support with comprehensive type definitions

## 📁 Structure

```
src/components/issue/
├── index.ts                     # Main exports
├── README.md                    # This file
├── IssueDetailContent.tsx       # Main content component
├── IssueDetailModal.tsx         # Modal wrapper
├── IssueHeader.tsx              # Issue title and metadata
├── IssueDescription.tsx         # Description with inline editing
├── IssueSidebar.tsx             # Properties sidebar
└── selectors/
    ├── IssueStatusSelector.tsx      # Status dropdown
    ├── IssuePrioritySelector.tsx    # Priority selector
    ├── IssueAssigneeSelector.tsx    # User assignment
    ├── IssueReporterSelector.tsx    # Reporter selection
    ├── IssueDateSelector.tsx        # Date picker
    └── IssueLabelSelector.tsx       # Multi-label selector
```

## 🚀 Quick Start

### Basic Usage

```tsx
import { IssueDetailModal } from "@/components/issue";

function MyComponent() {
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  return (
    <IssueDetailModal
      issueId={selectedIssueId}
      onClose={() => setSelectedIssueId(null)}
    />
  );
}
```

### Full Page View

```tsx
import { IssueDetailContent } from "@/components/issue";

function IssuePage({ issue }: { issue: Issue }) {
  const handleRefresh = () => {
    // Refresh issue data
  };

  return (
    <IssueDetailContent
      issue={issue}
      onRefresh={handleRefresh}
    />
  );
}
```

### Individual Selectors

```tsx
import { 
  IssueStatusSelector, 
  IssuePrioritySelector,
  IssueAssigneeSelector 
} from "@/components/issue";

function CustomForm() {
  return (
    <div className="space-y-4">
      <IssueStatusSelector
        value="In Progress"
        onChange={setStatus}
        projectId="project-id"
      />
      
      <IssuePrioritySelector
        value="HIGH"
        onChange={setPriority}
      />
      
      <IssueAssigneeSelector
        value="user-id"
        onChange={setAssignee}
        workspaceId="workspace-id"
      />
    </div>
  );
}
```

## 🎯 Key Features

### Issue Types
Supports all unified issue types with appropriate icons and colors:
- 🎯 **Epic** - Purple, Target icon
- 📖 **Story** - Blue, BookOpen icon  
- ✅ **Task** - Green, CheckSquare icon
- 🐛 **Defect** - Red, Bug icon
- 🏁 **Milestone** - Amber, Milestone icon
- 📝 **Subtask** - Gray, ChevronDown icon

### Priority Levels
Linear.app-style priority indicators:
- ⬇️ **Low** (P4) - Gray, ArrowDown
- ➖ **Medium** (P3) - Blue, Minus
- ⬆️ **High** (P2) - Amber, ArrowUp  
- 🚩 **Urgent** (P1) - Red, Flag

### Status Management
Dynamic status system based on project columns:
- Fetches available statuses from project configuration
- Color-coded badges with appropriate icons
- Fallback to default statuses if project not found

## 🔧 API Integration

### Required Endpoints

The components expect these API endpoints to be available:

```
GET /api/issues/:id              # Fetch issue details
PATCH /api/issues/:id            # Update issue fields
DELETE /api/issues/:id           # Delete issue
GET /api/projects/:id/columns    # Get project columns/statuses
GET /api/workspaces/:id/members  # Get workspace members
GET /api/workspaces/:id/labels   # Get workspace labels
```

### Data Structure

The components work with the unified Issue type:

```typescript
interface Issue {
  id: string;
  title: string;
  description?: string;
  type: IssueType; // EPIC | STORY | TASK | DEFECT | MILESTONE | SUBTASK
  status?: string;
  priority: IssuePriority; // LOW | MEDIUM | HIGH | URGENT
  
  // Relationships
  assignee?: IssueUser;
  reporter?: IssueUser;
  project?: IssueProject;
  labels?: IssueLabel[];
  
  // Dates
  dueDate?: Date;
  startDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Metadata
  issueKey?: string; // e.g., "PROJ-T123"
  // ... other fields
}
```

## 🎨 Styling

### Design Tokens

Components use consistent design tokens:

```css
/* Gradients */
bg-gradient-to-br from-background/80 to-muted/20

/* Borders */
border-border/50 hover:border-border/80

/* Shadows */
shadow-sm hover:shadow-md

/* Transitions */
transition-all duration-200
```

### Customization

Override styles using Tailwind CSS:

```tsx
<IssueDetailContent
  issue={issue}
  onRefresh={handleRefresh}
  className="custom-styles"
/>
```

## 🧪 Testing

Components are designed to be testable:

```tsx
import { render, screen } from "@testing-library/react";
import { IssueHeader } from "@/components/issue";

test("displays issue title", () => {
  const mockIssue = {
    id: "1",
    title: "Test Issue",
    type: "TASK",
    priority: "MEDIUM",
    // ... other required fields
  };

  render(
    <IssueHeader 
      issue={mockIssue} 
      onUpdateTitle={jest.fn()} 
    />
  );

  expect(screen.getByText("Test Issue")).toBeInTheDocument();
});
```

## 🔄 Migration from Old Components

### Replacing TaskDetailContent

**Before:**
```tsx
import { TaskDetailContent } from "@/components/tasks/TaskDetailContent";

<TaskDetailContent
  task={task}
  error={error}
  onRefresh={onRefresh}
  onClose={onClose}
  boardId={boardId}
/>
```

**After:**
```tsx
import { IssueDetailContent } from "@/components/issue";

<IssueDetailContent
  issue={issue} // Unified Issue type
  error={error}
  onRefresh={onRefresh}
  onClose={onClose}
  boardId={boardId}
/>
```

### Key Differences

1. **Unified Types**: Single `Issue` type instead of separate Task/Epic/Story types
2. **Simpler Props**: Fewer props, more consistent API
3. **Modular**: Broken into smaller, reusable components
4. **Type Safety**: Better TypeScript support
5. **Performance**: Optimized with proper memoization and loading states

## 🚀 Future Enhancements

- [ ] Comments and activity timeline
- [ ] Real-time collaboration
- [ ] Keyboard shortcuts
- [ ] Drag-and-drop support
- [ ] Rich text editing
- [ ] File attachments
- [ ] Issue relationships (blocks, relates to)
- [ ] Custom fields support
- [ ] Advanced filtering in selectors

## 🤝 Contributing

When adding new features:

1. Follow the existing design patterns
2. Maintain Linear.app-style aesthetics
3. Add proper TypeScript types
4. Include loading and error states
5. Write comprehensive tests
6. Update this documentation 