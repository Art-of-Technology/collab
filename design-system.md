# Collab Design System

Extracted from gold-standard components: AI Chat, Dashboard, and Layout Shell.
Dark-first. No `dark:` prefix — base styles ARE dark. Use `collab-*` Tailwind tokens exclusively.

---

## Core Philosophy

- **Dark-first** — Base styles are dark. Never use `dark:` prefix.
- **Token-driven** — Use `collab-*` Tailwind tokens. Never hardcode hex values.
- **Monochrome-first** — Color is used sparingly and intentionally for status/semantics.
- **Subtle depth** — Borders and slight opacity differences, not shadows or gradients.
- **Component reuse** — Use shared shadcn components. Never write raw `<button>` when `<Button>` exists.
- **Interactive everything** — Clickable elements, not plain text. Navigation via Next.js `<Link>`, not `<a>`.

---

## Color Palette

### Background Hierarchy

```
Body/Root        → transparent
├── Sidebar      → collab-950 (#070708)  — darkest
├── Page Area    → collab-900 (#101011)  — dark
│   ├── Cards    → collab-800 (#171719)  — lifted from page
│   │   └── Nested/Icon boxes → collab-900 (#101011)  — recede back
│   └── Skeletons → collab-800 (#171719)  — pulse animation
└── Borders      → collab-700 (#1f1f22)  — dividers everywhere
    └── Hover borders → collab-600 (#27272b) — one step lighter
```

| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `collab-950` | `#070708` | `bg-collab-950` | Sidebar, deepest bg, icon containers |
| `collab-900` | `#101011` | `bg-collab-900` | Page area, nested card sections, tooltips, dropdowns |
| `collab-800` | `#171719` | `bg-collab-800` | Cards, containers, interactive elements (default bg) |
| `collab-700` | `#1f1f22` | `border-collab-700` | Borders, dividers, badge bg, hover bg on cards |
| `collab-600` | `#27272b` | `border-collab-600` | Hover borders, avatar fallback bg |
| `collab-500` | `#75757a` | `text-collab-500` | Muted text, icons, labels, timestamps |
| `collab-400` | `#9c9ca1` | `text-collab-400` | Secondary text, inactive nav items |
| `collab-50`  | `#fafafa` | `text-collab-50` | Bright text (equivalent to `text-white`) |

### Text Hierarchy

| Level | Class | Usage |
|-------|-------|-------|
| Primary | `text-white` or `text-collab-50` | Headings, active nav, important text |
| Secondary | `text-collab-400` | Body text, descriptions, inactive nav |
| Muted | `text-collab-500` | Labels, icons, timestamps, section headers |
| AI body | `text-white/80` | AI message text content |
| Subtle | `text-white/40` | Tool indicators, avatar icons |
| Ghost | `text-white/30` | Agent name labels, ultra-muted |
| Invisible | `text-white/20` | Chevrons, kbd shortcuts |

### Semantic/Status Colors

Used as 10-15% opacity backgrounds with matching text:

| Status | Background | Text | Usage |
|--------|-----------|------|-------|
| In Progress | `bg-blue-500/15` | `text-blue-400` | Active work |
| In Review | `bg-purple-500/15` | `text-purple-400` | Review stage |
| Done | `bg-emerald-500/15` | `text-emerald-400` | Completed |
| Blocked | `bg-orange-500/15` | `text-orange-400` | Blocked items |
| Cancelled | `bg-red-500/10` | `text-red-400/70` | Cancelled |
| Deploy | `bg-cyan-500/15` | `text-cyan-400` | Ready to deploy |
| Backlog/Todo | `bg-slate-500/10` | `text-slate-400` | Not started |

### Priority Indicator Dots

| Priority | Class | Size |
|----------|-------|------|
| Urgent | `bg-red-500` | `w-2 h-2 rounded-full` |
| High | `bg-amber-500` | `w-2 h-2 rounded-full` |
| Medium | `bg-blue-500` | `w-2 h-2 rounded-full` |
| Low | `bg-slate-500` | `w-2 h-2 rounded-full` |

### Accent Colors

| Name | Hex | Usage |
|------|-----|-------|
| Blue | `#3b82f6` / `blue-500` | Primary actions, links, info |
| Emerald | `#22c55e` / `emerald-400` | Success, completed |
| Red | `#ef4444` / `red-400` | Error, destructive, urgent |
| Amber | `#f59e0b` / `amber-400` | Warning, overdue |
| Violet | `#8b5cf6` / `violet-400` | Code, filters, view icons |
| Cyan | `#06b6d4` / `cyan-400` | Web search, project icons |
| Orange | `#f97316` / `orange-400` | Overloaded, stale |

---

## Typography

### Font Stack

```css
font-family: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
font-family-mono: var(--font-geist-mono), 'SF Mono', Menlo, monospace;
```

### Scale

| Size | Class | Weight | Usage |
|------|-------|--------|-------|
| 24px | `text-2xl` | `font-medium` | Page titles (`PageHeader`) |
| 18px | `text-lg` | `font-bold` | H1 in AI text |
| 16px | `text-base` | `font-bold` | H2 in AI text |
| 14px | `text-sm` | `font-medium` | Body text, nav items, buttons |
| 13px | `text-[13px]` | — | Issue list item titles |
| 12px | `text-xs` | `font-medium` | Labels, issue keys, secondary text |
| 11px | `text-[11px]` | `font-medium` | Small descriptions, badge text |
| 10px | `text-[10px]` | `font-medium` or `font-semibold` | Micro labels, status badges, section headers |

### Special Typography

| Pattern | Classes | Usage |
|---------|---------|-------|
| Section header | `text-xs font-medium uppercase tracking-wider text-collab-500` | "Your Work", "Quick Access", list counts |
| Stat value | `text-3xl font-semibold tabular-nums` | StatCard numbers |
| Issue key | `text-collab-500 text-xs font-mono` | CLB-123 in issue rows |
| Inline code | `bg-violet-500/10 text-violet-300 px-1.5 py-0.5 rounded text-[11px] font-mono` | Code in AI text |
| Code block | `text-xs font-mono text-emerald-300/90` | Multi-line code |
| Kbd shortcut | `text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-white/20 font-mono` | ⌘K |

---

## Spacing

### Padding Scale

| Token | Usage |
|-------|-------|
| `px-1.5 py-0.5` | Compact badges, status chips |
| `px-2 py-1` | Inline chips (IssueChip, UserChip) |
| `px-2 py-2` | Sidebar nav items |
| `px-3 py-2` | List items (IssueListItem), table cells |
| `p-3` | Compact cards (ProjectCard, ViewCard, DynamicViewCard) |
| `p-4` | WorkSection expanded header |
| `p-5` | StatCard |
| `px-4 py-3` | AI message rows |
| `p-8` | Page layout (PageLayout) |

### Gap Scale

| Token | Usage |
|-------|-------|
| `gap-0.5` | Tight list items (`space-y-0.5`) |
| `gap-1` | Badge rows, inline elements |
| `gap-1.5` | Chip content, filter tags |
| `gap-2` | Standard inline spacing |
| `gap-3` | Card grids (Quick Access, Work Sections) |
| `gap-4` | Nav items, stat card grids, default sections |
| `gap-6` | Page layout sections (PageLayout default) |
| `gap-8` | Large page section gaps |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-sm` | 2px | Badge labels inside cards |
| `rounded` | 4px | Status badges in AI text |
| `rounded-md` | 6px | IssueChip, UserChip, filter badges |
| `rounded-lg` | 8px | Nav items, list items, generic containers, inputs |
| `rounded-xl` | 12px | Standard cards (ProjectCard, ViewCard, UserWorkloadCard) |
| `rounded-2xl` | 16px | Large cards (WorkSection, StatCard), mobile nav |
| `rounded-full` | 50% | Avatars, priority dots, send button |

---

## Component Patterns

### Page Structure

```tsx
<PageLayout className="gap-8">               {/* max-w-[1400px] mx-auto p-8, overflow-y-auto */}
  <PageHeader
    title="Page Title"                        {/* text-2xl font-medium text-white */}
    subtitle="Description"                    {/* text-sm text-collab-500 mt-0.5 */}
    actions={<Button>Action</Button>}
  />
  {/* Content sections with gap-6 or gap-8 */}
</PageLayout>
```

### Card (Interactive)

The standard clickable card pattern used everywhere:

```tsx
<button className={cn(
  "w-full text-left p-3 rounded-xl",
  "bg-collab-800 border border-collab-700",
  "hover:bg-collab-700 hover:border-collab-600",
  "transition-all cursor-pointer group"
)}>
  <div className="flex items-center gap-3">
    {/* Icon container */}
    <div className="p-2 rounded-lg bg-collab-900 border border-collab-700">
      <Icon className="w-4 h-4 text-cyan-400" />
    </div>
    {/* Content */}
    <div className="flex-1 min-w-0">
      <span className="text-sm font-medium text-collab-50 group-hover:text-white transition-colors truncate">
        {title}
      </span>
      <Badge className="h-4 px-1.5 text-[10px] font-medium leading-none border-0 rounded-sm bg-collab-700 text-collab-400">
        {tag}
      </Badge>
    </div>
    {/* Arrow indicator */}
    <ArrowRight className="w-4 h-4 text-collab-500/50 group-hover:text-collab-400 group-hover:translate-x-0.5 transition-all" />
  </div>
</button>
```

### Card (StatCard)

```tsx
<div className="p-5 rounded-2xl bg-collab-800 border border-collab-700">
  <div className="flex items-center gap-2 mb-2">
    <span className="text-xs text-collab-500">{label}</span>
  </div>
  <div className="text-3xl font-semibold tabular-nums text-white">{value}</div>
</div>
```

### Inline Chip (IssueChip, UserChip, ProjectChip)

```tsx
<button className={cn(
  "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
  "border transition-colors cursor-pointer",
  "bg-collab-800 border-collab-700 text-collab-50",
  "hover:bg-collab-700 hover:border-collab-600"
)}>
  <span className="font-mono font-semibold text-collab-400">{key}</span>
</button>
```

### IssueListItem (Shared)

The universal issue row used in dashboard AND AI chat:

```tsx
<div className="group flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-collab-700 transition-colors">
  {/* Indicator bar: w-1 h-6 rounded-full bg-blue-400 */}
  {/* Issue key: text-collab-500 text-xs font-mono */}
  {/* Title: text-[13px] text-collab-50 truncate */}
  {/* Labels: Badge with h-4 px-1.5 text-[10px] */}
  {/* Extra slot: custom right-side content */}
  {/* Assignee: UserAvatar size="sm" */}
</div>
```

### Section Header

```tsx
<div className="text-xs font-medium uppercase tracking-wider text-collab-500 mb-3">
  Your Work
</div>
```

### List with Header

```tsx
<div className="space-y-1">
  <div className="flex items-center justify-between mb-2 px-1">
    <span className="text-xs font-medium text-collab-500 uppercase tracking-wider">
      {count} Issues
    </span>
  </div>
  <div className="space-y-0.5">
    {items.map((item, i) => (
      <motion.div
        key={item.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.03, duration: 0.15 }}
      >
        <IssueCard data={item} />
      </motion.div>
    ))}
  </div>
</div>
```

### Tooltip

```tsx
<TooltipProvider delayDuration={150}>
  <Tooltip>
    <TooltipTrigger asChild>{trigger}</TooltipTrigger>
    <TooltipContent
      side="top"
      className="bg-collab-900 border-collab-700 p-3 max-w-xs shadow-xl"
    >
      {content}
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

### Empty State

```tsx
<div className="py-8 text-center">
  <div
    className="w-full h-16 rounded-lg mb-3"
    style={{
      backgroundImage: "radial-gradient(circle, #1f1f22 1px, transparent 1px)",
      backgroundSize: "8px 8px",
    }}
  />
  <p className="text-xs text-collab-500">{text}</p>
</div>
```

### Loading Skeleton

```tsx
<div className="animate-pulse">
  <div className="h-8 w-48 bg-collab-800 rounded-lg mb-2" />        {/* Text block */}
  <div className="h-24 bg-collab-800 rounded-2xl border border-collab-700" /> {/* Card */}
</div>
```

---

## Sidebar Navigation

### Nav Item

```tsx
// Inactive
<Link className={cn(
  "flex items-center gap-4 rounded-lg px-2 py-2 text-sm font-medium transition-all duration-150",
  "text-collab-400 hover:text-white hover:bg-collab-800"
)}>
  <Icon className="h-4 w-4 text-collab-500" />
  <span>{label}</span>
</Link>

// Active
<Link className={cn(
  "flex items-center gap-4 rounded-lg px-2 py-2 text-sm font-medium",
  "bg-collab-800 text-white"
)}>
  <Icon className="h-4 w-4 text-white" />
  <span>{label}</span>
</Link>
```

### Nested Items (Starred Projects/Views)

```tsx
<div className="mt-1 space-y-0.5 ml-6 pl-3 border-l border-collab-700">
  <Link className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-sm text-collab-400 hover:text-white hover:bg-collab-900">
    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
    <span className="truncate">{name}</span>
  </Link>
</div>
```

### User Menu

```tsx
<DropdownMenuContent className="w-56 bg-collab-900 border-collab-700">
  <DropdownMenuItem className="text-collab-400 hover:text-white focus:bg-collab-800">
    <Settings className="mr-2 h-4 w-4" /> Settings
  </DropdownMenuItem>
  <DropdownMenuSeparator className="bg-collab-700" />
  <DropdownMenuItem className="text-red-400 hover:text-red-300 focus:bg-red-500/10">
    <LogOut className="mr-2 h-4 w-4" /> Sign out
  </DropdownMenuItem>
</DropdownMenuContent>
```

---

## AI Chat Patterns

### Message Layout

```tsx
<div className="flex items-start gap-3 px-4 py-3 group">
  {/* Avatar: w-6 h-6 rounded-full */}
  <div className="flex-1 min-w-0 glass-subtle rounded-xl px-3 py-2">
    <span className="text-[10px] font-medium text-white/30 mb-1 block">{agentName}</span>
    <div className="text-sm text-white/80 leading-relaxed">{content}</div>
  </div>
</div>
```

### Collapsible Tool Call

```tsx
<button className="flex items-center gap-2 py-1 text-xs text-white/30 hover:text-white/50 transition-colors">
  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/60" />  {/* or XCircle red, or Loader2 spinning */}
  <Wrench className="w-3 h-3 text-white/20" />                   {/* or Globe for web search */}
  <span>Used <span className="font-medium text-white/40">{toolName}</span></span>
  <ChevronRight className="w-3 h-3 text-white/20 transition-transform duration-200" />  {/* rotate-90 when open */}
</button>
```

### Error Result

```tsx
<div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
  <div className="text-sm text-red-300/90 leading-relaxed">{content}</div>
</div>
```

### Success Result

```tsx
<div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
  <div className="text-sm text-emerald-300/90 leading-relaxed">{content}</div>
</div>
```

### Web Search Results

```tsx
<a className={cn(
  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs",
  "bg-cyan-500/5 border border-cyan-500/15",
  "text-cyan-300/70 hover:text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-500/25",
  "transition-all duration-200"
)}>
  <ExternalLink className="w-3 h-3" />
  <span className="truncate max-w-[200px]">{title}</span>
</a>
```

### Generic Result (Fallback)

```tsx
<div className="rounded-lg bg-collab-800 border border-collab-700 overflow-hidden">
  <div className="flex items-center gap-2 px-3 py-2 border-b border-collab-700">
    <FileText className="w-3.5 h-3.5 text-collab-500" />
    <span className="text-[10px] font-medium text-collab-500 uppercase tracking-wider">{toolName}</span>
  </div>
  <pre className="p-3 text-xs text-collab-400 font-mono leading-relaxed overflow-x-auto max-h-[200px]">
    {content}
  </pre>
</div>
```

### Styled Markdown Table

```tsx
<div className="overflow-x-auto rounded-lg border border-collab-700">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b border-collab-700 bg-collab-800/60">
        <th className="px-3 py-2 text-left text-[11px] font-medium text-collab-400 uppercase tracking-wider" />
      </tr>
    </thead>
    <tbody>
      <tr className="border-b border-collab-700/50 last:border-0 hover:bg-collab-800/30 transition-colors">
        <td className="px-3 py-2 text-sm text-collab-50" />
      </tr>
    </tbody>
  </table>
</div>
```

---

## Glass Morphism (AI Chat)

Used for the chat bar container and AI message bubbles:

```tsx
// Chat container
"bg-white/[0.04] backdrop-blur-xl border border-white/[0.08]"
"shadow-[0_8px_40px_rgba(0,0,0,0.4)]"

// Focused state
"border-white/[0.12]"
"boxShadow: 0 8px 50px rgba(0,0,0,0.5), 0 0 30px ${agentColor}08"

// AI message bubble
"glass-subtle rounded-xl px-3 py-2"

// User message bg
"bg-white/[0.02]"
```

### Opacity Scale for Glass Elements

| Opacity | Usage |
|---------|-------|
| `white/[0.02]` | Barely visible bg tint (user messages) |
| `white/[0.04]` | Glass container bg, hover states |
| `white/[0.06]` | Subtle borders, dividers |
| `white/[0.08]` | Container borders, selected items |
| `white/[0.12]` | Focused container borders |

---

## Animation

### Framer Motion Patterns

```tsx
// List item stagger (issues, members, projects)
initial={{ opacity: 0, y: 6 }}
animate={{ opacity: 1, y: 0 }}
transition={{ delay: i * 0.03, duration: 0.15 }}

// Tool result entry
initial={{ opacity: 0, y: 4 }}
animate={{ opacity: 1, y: 0 }}
transition={{ duration: 0.15 }}

// Expand/collapse (height)
initial={{ height: 0, opacity: 0 }}
animate={{ height: "auto", opacity: 1 }}
exit={{ height: 0, opacity: 0 }}
transition={{ duration: 0.2 }}

// Scale (modals, image previews)
initial={{ opacity: 0, scale: 0.95 }}
animate={{ opacity: 1, scale: 1 }}
transition={{ duration: 0.2, ease: "easeOut" }}

// Spring (toggle icons)
transition={{ type: "spring", stiffness: 260, damping: 25 }}
```

### CSS Transitions

| Speed | Class | Usage |
|-------|-------|-------|
| Instant | `transition-colors` | Color-only changes (nav hover) |
| Fast | `transition-all duration-150` | Nav items, list items |
| Standard | `transition-all duration-200` | Cards, expand/collapse, inputs |
| Slow | `duration-300` | Message entry animations |

### CSS Animations

| Animation | Usage |
|-----------|-------|
| `animate-pulse` | Loading skeletons, recording indicator |
| `animate-spin` | Loading spinners (Loader2 icon) |
| `animate-in fade-in slide-in-from-bottom-2 duration-300` | AI message entry |

---

## Layout Dimensions

### Sidebar

| State | Width |
|-------|-------|
| Expanded | CSS var `--sidebar-width` |
| Collapsed | `56px` (`w-[56px]`) |

### Page Content

| Property | Value |
|----------|-------|
| Max width (default) | `max-w-[1400px]` |
| Max width (wide) | `max-w-[1600px]` |
| Padding | `p-8` (32px) |
| Section gap | `gap-6` (24px) |

### Dashboard Work Sections

| State | Width |
|-------|-------|
| Expanded | `w-[320px]` |
| Collapsed | `w-[56px]` |
| Max content height | `max-h-[320px]` with overflow-y-auto |

### Responsive Breakpoints

| Breakpoint | Prefix | Usage |
|------------|--------|-------|
| Mobile | (default) | Single column, bottom nav |
| Tablet+ | `md:` (768px) | Sidebar visible, grid layouts |
| Desktop | `lg:` (1024px) | Extended grid columns |

### Responsive Grid Patterns

```tsx
// Stat cards
"grid grid-cols-2 md:grid-cols-4 gap-4"

// Quick access
"grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3"

// Work sections (horizontal scroll)
"flex gap-3 overflow-x-auto pb-4"
```

---

## Anti-Patterns (NEVER do these)

| Anti-Pattern | Correct Pattern |
|-------------|-----------------|
| `dark:bg-[#171719]` | `bg-collab-800` |
| `dark:text-[#9c9ca1]` | `text-collab-400` |
| `dark:border-[#1f1f22]` | `border-collab-700` |
| `dark:hover:bg-[#27272b]` | `hover:bg-collab-600` |
| Hardcoded hex in className | Use `collab-*` tokens |
| `<button>` for actions | `<Button>` from shadcn |
| `<a target="_blank">` for internal links | `<Link>` from `next/link` |
| `as any` / `@ts-ignore` | Fix the type properly |
| Empty `catch(e) {}` | Handle the error |
| `hover:bg-collab-800` on `bg-collab-800` parent | `hover:bg-collab-700` (must be visibly different) |

---

## Shared UI Components Reference

| Component | File | Usage |
|-----------|------|-------|
| `PageLayout` | `ui/page-layout.tsx` | Every page wrapper (`p-8`, `max-w-[1400px]`) |
| `PageHeader` | `ui/page-header.tsx` | Page title + subtitle + actions |
| `StatCard` | `ui/stat-card.tsx` | Numeric stat display with variant colors |
| `IssueListItem` | `ui/issue-list-item.tsx` | Universal issue row (dashboard + AI chat) |
| `UserAvatar` | `ui/user-avatar.tsx` | User avatar with xs/sm/md/lg sizes |
| `Badge` | `ui/badge.tsx` | Shadcn badge (often overridden with custom classes) |
| `Button` | `ui/button.tsx` | Shadcn button — use this, not raw `<button>` |
| `IssueCard` | `ai/InteractiveElements.tsx` | AI issue card wrapping shared `IssueListItem` |
| `IssueChip` | `ai/InteractiveElements.tsx` | Inline issue reference with tooltip |
| `IssueList` | `ai/InteractiveElements.tsx` | Animated list of `IssueCard` items |
| `UserChip` | `ai/InteractiveElements.tsx` | Inline user reference with tooltip |
| `DynamicViewCard` | `ai/InteractiveElements.tsx` | Generated view card with filters |
| `ToolResultRenderer` | `ai/ToolResultRenderer.tsx` | Dispatch all MCP tool results to rich UI |

---

## CSS Variables

```css
:root {
  --collab-950: #070708;
  --collab-900: #101011;
  --collab-800: #171719;
  --collab-700: #1f1f22;
  --collab-600: #27272b;
  --collab-500: #75757a;
  --collab-400: #9c9ca1;
  --collab-50: #fafafa;

  --sidebar-background: var(--collab-950);
  --page-background: var(--collab-900);
  --card-background: var(--collab-800);
  --border: var(--collab-700);

  --text-primary: var(--collab-50);
  --text-secondary: var(--collab-400);
  --text-muted: var(--collab-500);

  --accent-blue: #3b82f6;
  --accent-blue-hover: #2563eb;
  --status-success: #22c55e;
  --status-warning: #f59e0b;
  --status-error: #ef4444;

  --radius: 0.6rem;
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
}
```
