# JINLAB Nexus Design System v1

## Core rule

Nexus must look like one operating system, not a collection of unrelated modules.

Use design tokens (`primary`, `card`, `muted`, `border`, `destructive`) instead of hard-coded decorative Tailwind colours.

## JINLAB colour meaning

### Blue — brand / primary
Use for:
- primary buttons
- selected navigation
- links
- focus
- general information
- active tools
- recalled / held operational states

### Green — success only
Use for:
- paid
- completed
- balanced
- successful
- reconciled
- healthy positive status

Do not use green simply because a card needs colour.

### Amber — warning only
Use for:
- pending
- low stock
- attention needed
- approaching limits
- unresolved operational warning

### Red — destructive / risk only
Use for:
- errors
- failed actions
- overdue critical state
- delete / destructive confirmation
- security/fraud alerts

### Neutral
Use white, grey and dark neutral tones for:
- cards
- backgrounds
- tables
- secondary controls
- normal text
- dividers

## Supported themes

1. `jinlab_blue`
   - default
   - Windows-style light workspace
   - blue actions
   - white/light-grey surfaces

2. `jinlab_blue_dark`
   - dark surfaces
   - same JINLAB blue identity

3. `system`
   - follows device light/dark preference
   - always retains JINLAB blue

## Development rule

Prefer:

- `bg-primary`
- `text-primary`
- `bg-primary/10`
- `border-primary/30`
- `bg-card`
- `bg-muted`
- `text-muted-foreground`
- `bg-destructive/10`

Avoid decorative hard-coded classes such as:

- `bg-purple-*`
- `bg-pink-*`
- `bg-violet-*`
- `bg-emerald-*`

unless the colour has an explicitly approved semantic meaning.

## Theme ownership

Theme is company-level.

Only Owner/Admin may change the theme.

All authenticated company users inherit the selected company theme automatically.
