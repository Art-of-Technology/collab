# Collab Design System

Based on Polar.sh aesthetic - minimal, professional, dark-first design.

---

## Core Philosophy

- **Minimal** - Remove visual noise, let content breathe
- **Monochrome-first** - Color is used sparingly and intentionally
- **Professional** - Clean, enterprise-ready appearance
- **Subtle depth** - Use borders and slight opacity differences, not shadows or gradients

---

## Color Palette (Dark Mode)

### Backgrounds (HSL with slight blue tint)

| Token | Hex | HSL | Usage |
|-------|-----|-----|-------|
| `--collab-950` | `#070708` | hsl(233, 5%, 3%) | Sidebar background |
| `--collab-900` | `#101011` | hsl(233, 5%, 6.5%) | Page content area |
| `--collab-800` | `#171719` | hsl(233, 5%, 9.5%) | Cards, sections |
| `--collab-700` | `#1f1f22` | hsl(233, 5%, 12%) | Borders |
| `--collab-600` | `#27272b` | hsl(233, 5%, 16%) | Hover states |
| `--collab-500` | `#75757a` | hsl(233, 5%, 46%) | Secondary text |
| `--collab-400` | `#9c9ca1` | hsl(233, 5%, 61%) | Muted text |
| `--collab-50` | `#fafafa` | hsl(0, 0%, 98%) | Primary text |

### Background Hierarchy

```
Body/Root        → transparent (dark mode)
├── Sidebar      → collab-950 (#070708) - darkest
├── Page Area    → collab-900 (#101011) - dark
│   └── Cards    → collab-800 (#171719) - lighter than page
│       └── Nested → collab-900 (#101011) - back to page color
```

### Borders

| Token | Hex | Usage |
|-------|-----|-------|
| `--border-default` | `#1f1f22` | Default borders (collab-700) |
| `--border-subtle` | `#171719` | Subtle borders |
| `--border-strong` | `#27272b` | Emphasized borders |

### Text

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#fafafa` | Headings, important text (collab-50) |
| `--text-secondary` | `#9c9ca1` | Body text (collab-400) |
| `--text-muted` | `#75757a` | Muted text, timestamps (collab-500) |
| `--text-disabled` | `#4a4a4e` | Disabled states |

### Accent Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--accent-blue` | `#2563eb` | Primary actions, links (blue-600) |
| `--accent-blue-hover` | `#3b82f6` | Blue hover state (blue-500) |
| `--status-success` | `#22c55e` | Success states |
| `--status-warning` | `#f59e0b` | Warning states |
| `--status-error` | `#ef4444` | Error states |

---

## Typography

### Font Stack

```css
font-family: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
font-family-mono: var(--font-geist-mono), 'SF Mono', Menlo, monospace;
```

### Scale

| Size | Value | Usage |
|------|-------|-------|
| `text-xs` | 12px | Labels, badges |
| `text-sm` | 14px | Body text, buttons |
| `text-base` | 16px | Emphasized body |
| `text-lg` | 18px | Section headers |
| `text-xl` | 20px | Subheadings |
| `text-2xl` | 24px | Page titles |

### Weights

- `normal` (400) - Body text
- `medium` (500) - Labels, buttons, nav items
- `semibold` (600) - Headings

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `rounded-lg` | 8px | Small elements, buttons |
| `rounded-xl` | 12px | Standard cards, inputs |
| `rounded-2xl` | 16px | Large cards, page sections |
| `rounded-4xl` | 32px | Hero sections |

---

## Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `p-2` | 8px | Sidebar item padding |
| `p-4` | 16px | Component padding |
| `p-5` | 20px | List item padding |
| `p-8` | 32px | Page/section padding |
| `gap-2` | 8px | Tight spacing |
| `gap-4` | 16px | Default gaps |
| `gap-8` | 32px | Section gaps |

---

## Components

### Page Layout Structure

```tsx
// Main layout wrapper
<div className="flex h-full w-full flex-row md:p-2 dark:bg-transparent">
  {/* Sidebar */}
  <aside className="bg-[#070708]">
    <DashboardSidebar />
  </aside>

  {/* Main content area */}
  <main className="bg-[#101011] rounded-2xl border border-[#1f1f22]">
    {/* Page content */}
  </main>
</div>
```

### Cards (ShadowBox pattern)

```tsx
// Standard card
<div className="bg-[#171719] border-[#1f1f22] rounded-xl border p-8">
  {children}
</div>

// Nested section inside card
<div className="bg-[#101011] rounded-xl p-4">
  {content}
</div>
```

### List Groups

```tsx
<div className="bg-[#171719] ring-[#1f1f22] rounded-2xl ring-1">
  <div className="border-[#1f1f22] border-t p-5 first:border-t-0">
    {item}
  </div>
</div>
```

### Sidebar Navigation

```tsx
// Nav item base
<Link className="flex items-center gap-4 rounded-lg px-2 py-2 text-sm
                 text-[#9c9ca1] hover:bg-[#171719] hover:text-white">
  <Icon className="h-4 w-4" />
  <span>Label</span>
</Link>

// Active state
<Link className="... bg-[#171719] text-white">
```

### Search Box (Sidebar)

```tsx
<button className="bg-[#070708] border-[#1f1f22] hover:bg-[#171719]
                   flex items-center gap-4 rounded-lg border px-2 py-2 text-sm">
  <Search className="h-4 w-4 text-[#75757a]" />
  <span className="text-[#75757a]">Search...</span>
  <kbd className="bg-[#171719] text-[#9c9ca1]
                  ml-auto rounded px-1.5 py-0.5 text-xs">⌘K</kbd>
</button>
```

### Buttons

```tsx
// Primary
<button className="bg-blue-600 hover:bg-blue-500 text-white
                   rounded-xl px-4 py-2 text-sm font-medium">
  Action
</button>

// Secondary
<button className="bg-[#1f1f22] hover:bg-[#27272b]
                   border-white/5 text-white
                   rounded-xl px-4 py-2 text-sm font-medium">
  Secondary
</button>

// Ghost
<button className="hover:bg-[#1f1f22] text-white
                   rounded-xl px-4 py-2 text-sm font-medium">
  Ghost
</button>
```

---

## Layout Dimensions

### Sidebar

| State | Width |
|-------|-------|
| Expanded | 14rem (224px) |
| Collapsed | 3rem (48px) |
| Mobile | 18rem (288px) |

### Page Content

- Max width: 1200px for content
- Padding: p-8 (32px) for main area
- Gap between sidebar and content: gap-2 (8px)
- Border radius: rounded-2xl (16px)

---

## Animation

**Duration:**
- Fast: 100ms (hover states)
- Normal: 150ms (transitions)
- Slow: 200ms (expand/collapse)

**Easing:**
- Default: `ease-out`

---

## CSS Variables

```css
:root {
  /* Collab Design System Colors */
  --collab-950: #070708;
  --collab-900: #101011;
  --collab-800: #171719;
  --collab-700: #1f1f22;
  --collab-600: #27272b;
  --collab-500: #75757a;
  --collab-400: #9c9ca1;
  --collab-50: #fafafa;

  /* Semantic mappings */
  --sidebar-background: var(--collab-950);
  --page-background: var(--collab-900);
  --card-background: var(--collab-800);
  --border: var(--collab-700);

  /* Text */
  --text-primary: var(--collab-50);
  --text-secondary: var(--collab-400);
  --text-muted: var(--collab-500);

  /* Accents */
  --accent-blue: #2563eb;
  --accent-blue-hover: #3b82f6;

  /* Status */
  --status-success: #22c55e;
  --status-warning: #f59e0b;
  --status-error: #ef4444;

  /* Border radius */
  --radius: 0.6rem;
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
}
```

---

## Tailwind Classes Reference

### Common Patterns

```tsx
// Sidebar
"dark:bg-[#070708]"

// Page content wrapper
"dark:bg-[#101011] dark:border-[#1f1f22] rounded-2xl border"

// Cards
"dark:bg-[#171719] dark:border-[#1f1f22] rounded-xl border"

// Nested card sections
"dark:bg-[#101011] rounded-xl"

// Text hierarchy
"dark:text-white"           // Primary
"dark:text-[#9c9ca1]"      // Secondary
"dark:text-[#75757a]"      // Muted

// Borders
"dark:border-[#1f1f22]"

// Hover states
"dark:hover:bg-[#27272b]"
```
