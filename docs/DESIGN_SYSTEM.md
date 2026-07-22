# Ultra-Modern Glassmorphism Design System

An elite, minimal design system built for dark themes with subtle glassmorphism effects. Compact, refined, and professionally understated.

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Glassmorphism Effects](#glassmorphism-effects)
6. [Component Patterns](#component-patterns)
7. [Icons](#icons)
8. [Animations](#animations)
9. [Code Examples](#code-examples)

---

## Design Philosophy

### Core Principles

1. **Minimal & Elite**: Less is more. Clean interfaces with restrained use of color
2. **Subtle Glassmorphism**: Very low opacity backgrounds (2-5%), subtle borders
3. **High Contrast Text**: Ensure readability with proper contrast ratios
4. **Compact Design**: Efficient use of space without feeling cramped
5. **Smooth Transitions**: 200-300ms transitions for all interactive elements
6. **Muted Color Palette**: Avoid bright colors; use restrained, professional tones

### Visual Hierarchy

- **Primary actions**: Subtle buttons with barely-there backgrounds
- **Secondary actions**: Ghost buttons, nearly invisible until hovered
- **Content cards**: Ultra-subtle glass with 2% opacity
- **Text**: White with varying opacity (50-90%) for hierarchy
- **Accents**: Muted emerald for success, amber for warnings, primary blue sparingly

---

## Color System

### Background & Surfaces

```css
/* Background - Pure dark with subtle ambient gradients */
body {
  background-color: oklch(0.098 0 0);
  background-image:
    radial-gradient(ellipse 100% 80% at 20% 0%, oklch(0.15 0.02 250 / 20%), transparent 50%),
    radial-gradient(ellipse 60% 50% at 80% 100%, oklch(0.12 0.015 200 / 15%), transparent 50%);
}

/* Card surfaces */
--glass-bg: rgba(255, 255, 255, 0.02);        /* Ultra-subtle */
--glass-bg-hover: rgba(255, 255, 255, 0.03);  /* On hover */
--glass-bg-active: rgba(255, 255, 255, 0.04); /* Active state */

/* Borders */
--glass-border: rgba(255, 255, 255, 0.05);
--glass-border-hover: rgba(255, 255, 255, 0.08);
```

### Text Opacity Scale

| Purpose | Opacity | Example Class | Usage |
|---------|---------|---------------|-------|
| Primary | 90-100% | `text-white`, `text-white/90` | Headings, important values |
| Secondary | 70-80% | `text-white/80` | Card titles, labels |
| Tertiary | 50-60% | `text-white/50`, `text-white/60` | Descriptions, metadata |
| Muted | 35-40% | `text-white/40` | Subtitles, hints |
| Disabled | 20-30% | `text-white/30` | Inactive elements |

### Accent Colors (Use Sparingly)

| Purpose | Color | Usage |
|---------|-------|-------|
| Primary accent | `oklch(0.65 0.15 250)` (blue) | Focus rings, important CTAs |
| Success | `emerald-400/500` | Positive states, live indicators |
| Warning | `amber-400` | Pending states, notifications |
| Error | `red-400` | Destructive actions |

---

## Typography

### Font Stack

```css
--font-sans: "Geist", system-ui, -apple-system, sans-serif;
--font-mono: "Geist Mono", "Fira Code", monospace;
```

### Text Styles

| Style | Size | Weight | Opacity | Usage |
|-------|------|--------|---------|-------|
| Page label | 11px | normal | 40% | Section labels, uppercase |
| Page title | 20px | medium | 100% | Main headings |
| Section header | 13px | medium | 80% | Card titles |
| Body text | 13px | normal | 80% | Main content |
| Small text | 11px | normal | 50-60% | Labels, metadata |
| Micro text | 10px | normal | 40-50% | Timestamps, hints |
| Mono text | 11px | normal | 40% | Code, commands |

### Typography Examples

```jsx
// Page label (uppercase, tracking)
<p className="text-[11px] uppercase tracking-[0.2em] text-white/40">Dashboard</p>

// Page title
<h1 className="text-xl font-medium text-white">Welcome back</h1>

// Section header
<span className="text-[13px] font-medium text-white/80">Recent Patterns</span>

// Body text
<p className="text-[13px] text-white/80">Pattern description here</p>

// Small text
<span className="text-[11px] text-white/50">5 uses</span>

// Micro text
<span className="text-[10px] text-white/40">2 hours ago</span>

// Code/mono text
<code className="text-[11px] text-white/40 font-mono">git checkout -b</code>
```

---

## Spacing & Layout

### Spacing Scale

| Name | Value | Usage |
|------|-------|-------|
| xs | 4px (1) | Inline gaps |
| sm | 8px (2) | Icon gaps |
| md | 12px (3) | Card padding |
| lg | 16px (4) | Section gaps |
| xl | 24px (6) | Major sections |
| 2xl | 32px (8) | Page margins |

### Border Radius

```css
--radius-sm: 8px;   /* Buttons, badges */
--radius-md: 10px;  /* Small cards */
--radius-lg: 12px;  /* Standard cards */
--radius-xl: 16px;  /* Large cards */
```

### Layout Grid

```jsx
// Stats grid (2 cols on mobile, 4 on desktop)
<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

// Content grid (7/5 split)
<div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
  <div className="lg:col-span-7">Main content</div>
  <div className="lg:col-span-5">Sidebar</div>
</div>

// Action cards (2 cols)
<div className="grid grid-cols-2 gap-3">
```

---

## Glassmorphism Effects

### Ultra Glass Card

The signature component. Very subtle, barely visible but creates depth.

```jsx
function GlassCard({ children, className }) {
  return (
    <div
      className={cn(
        "rounded-xl p-4",
        "bg-white/[0.02] backdrop-blur-xl",
        "border border-white/[0.05]",
        "shadow-[0_0_1px_0_rgba(255,255,255,0.03)_inset]",
        className
      )}
    >
      {children}
    </div>
  );
}
```

### CSS Utility Classes

```css
/* Ultra-subtle glass */
.glass-ultra {
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 0 1px 0 rgba(255, 255, 255, 0.03) inset;
}

/* With hover effect */
.glass-ultra-hover {
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.glass-ultra-hover:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
}

/* Frosted variant */
.glass-frosted {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.03) 0%,
    rgba(255, 255, 255, 0.01) 100%
  );
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
```

---

## Component Patterns

### Stat Card

Compact stat display with icon.

```jsx
function StatCard({ label, value, sub, icon, accent }) {
  return (
    <div className={cn(
      "group relative rounded-xl p-3",
      "bg-white/[0.02] backdrop-blur-xl",
      "border border-white/[0.05]",
      "hover:bg-white/[0.03] hover:border-white/[0.08]",
      "transition-all duration-300"
    )}>
      <div className="flex items-start justify-between mb-2">
        <div className={cn(
          "h-7 w-7 rounded-lg flex items-center justify-center",
          "bg-white/[0.03] border border-white/[0.06]",
          "[&_svg]:text-white/50",
          accent && "bg-primary/10 border-primary/20 [&_svg]:text-primary"
        )}>
          {icon}
        </div>
      </div>
      <div className="space-y-0.5">
        <p className="text-xl font-light text-white tabular-nums">{value}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-white/50">{label}</span>
          {sub && (
            <>
              <span className="text-white/20">·</span>
              <span className="text-[11px] text-white/60">{sub}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Action Card

Clickable card with icon and arrow.

```jsx
function ActionCard({ href, icon, title, subtitle, highlight }) {
  return (
    <Link href={href}>
      <div className={cn(
        "group relative rounded-xl p-3",
        "bg-white/[0.02] backdrop-blur-xl",
        "border border-white/[0.05]",
        "hover:bg-white/[0.04] hover:border-white/[0.08]",
        "transition-all duration-300 cursor-pointer",
        highlight && "border-primary/20 bg-primary/[0.02]"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-9 w-9 rounded-lg flex items-center justify-center",
            "bg-white/[0.03] border border-white/[0.06]",
            "[&_svg]:text-white/50",
            highlight && "bg-primary/10 border-primary/20 [&_svg]:text-primary"
          )}>
            {icon}
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-medium text-white/90">{title}</p>
            <p className="text-[11px] text-white/50">{subtitle}</p>
          </div>
          <ArrowUpRight className="h-3.5 w-3.5 text-white/30 group-hover:text-white/50 transition-colors" />
        </div>
      </div>
    </Link>
  );
}
```

### List Row

For items in a list with hover state.

```jsx
function ListRow({ children, isLast }) {
  return (
    <div className={cn(
      "group flex items-center gap-3 p-2 -mx-2 rounded-lg",
      "hover:bg-white/[0.02] transition-colors cursor-pointer",
      !isLast && "border-b border-white/[0.03]"
    )}>
      {children}
    </div>
  );
}
```

### Progress Bar

Minimal progress indicator.

```jsx
function ProgressBar({ value }) {
  return (
    <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all duration-500"
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}
```

### Live Indicator

Animated status dot.

```jsx
function LiveIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/[0.02] border border-white/[0.05]">
      <div className="relative">
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <div className="absolute inset-0 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
      </div>
    </div>
  );
}
```

### Empty State

Placeholder when no content.

```jsx
function EmptyPlaceholder({ icon, text, subtext }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div className="h-10 w-10 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mb-2 [&_svg]:text-white/30">
        {icon}
      </div>
      <p className="text-[12px] text-white/50">{text}</p>
      <p className="text-[11px] text-white/35">{subtext}</p>
    </div>
  );
}
```

---

## Icons

### Icon Library

Use **Lucide React** for all icons. Never use emojis.

### Icon Sizing

| Size | Class | Usage |
|------|-------|-------|
| xs | `h-3 w-3` | In buttons, inline |
| sm | `h-3.5 w-3.5` | Small icons |
| md | `h-4 w-4` | Standard size |
| lg | `h-5 w-5` | Card headers |

### Icon Colors

```jsx
// In icon containers
<div className="[&_svg]:text-white/50">
  <Icon className="h-3.5 w-3.5" />
</div>

// Standalone with hover
<Icon className="h-3 w-3 text-white/20 group-hover:text-white/40 transition-colors" />

// Accent (use sparingly)
<Icon className="h-4 w-4 text-emerald-400" />
```

---

## Animations

### Transition Defaults

```css
/* Standard - buttons, icons */
transition-all duration-200

/* Cards and containers */
transition-all duration-300

/* Easing */
transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1)
```

### Pulse Animation

For live indicators.

```jsx
<div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />

// Or with ping for emphasis
<div className="relative">
  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
  <div className="absolute inset-0 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
</div>
```

### Hover States

```jsx
// Card hover
hover:bg-white/[0.03] hover:border-white/[0.08]

// Icon hover (use with group)
group-hover:text-white/40

// Button hover
hover:bg-white/[0.04]
```

---

## Quick Reference

### Card Classes

```
/* Glass card */
rounded-xl p-4 bg-white/[0.02] backdrop-blur-xl border border-white/[0.05]

/* With hover */
hover:bg-white/[0.03] hover:border-white/[0.08] transition-all duration-300

/* Icon container */
h-7 w-7 rounded-lg bg-white/[0.03] border border-white/[0.06] flex items-center justify-center
```

### Text Classes

```
/* Primary heading */
text-xl font-medium text-white

/* Section header */
text-[13px] font-medium text-white/80

/* Label */
text-[11px] text-white/50

/* Uppercase label */
text-[11px] uppercase tracking-[0.2em] text-white/40

/* Description */
text-[11px] text-white/50

/* Muted */
text-[10px] text-white/40
```

### Border Classes

```
border border-white/[0.05]              /* Standard */
border border-white/[0.03]              /* Dividers */
border-b border-white/[0.03]            /* Bottom divider */
border-primary/20                       /* Accent border */
```

---

## Best Practices

1. **Use 2% opacity** for card backgrounds, never more than 5%
2. **Keep borders at 5% opacity** - barely visible
3. **Ensure text contrast** - minimum 50% opacity for readable text
4. **Use 11px minimum** for any text that needs to be readable
5. **Animate thoughtfully** - 200ms for interactions, 300ms for cards
6. **Use Lucide icons** consistently - size h-3.5 to h-5
7. **Group hover states** - use `group` and `group-hover:` for coordinated effects
8. **Avoid bright colors** - keep accents muted and use sparingly
9. **Use tabular-nums** for numbers to ensure alignment
10. **Add subtle shadows** only for depth: `shadow-[0_0_1px_0_rgba(255,255,255,0.03)_inset]`
