# UI AGENTS.md — Dyno Dashboard UI Source of Truth

## Purpose

This file is the canonical UI source of truth for Dyno dashboard work.

Its job is to keep the product visually consistent, professional, and system-driven across pages and iterations.

When making UI changes, prioritize:
1. consistency over novelty
2. clarity over decoration
3. density over emptiness
4. reusable primitives over one-off styling
5. product credibility over “AI-generated” aesthetics

This dashboard should feel closer to Vercel, Stripe Dashboard, or Linear than to a flashy SaaS template.

---

## Product UI character

Dyno is a developer infrastructure product. The UI should communicate:

- precision
- reliability
- operational clarity
- calm confidence
- technical seriousness

The dashboard should **not** feel:
- playful
- over-branded
- glossy
- gradient-heavy
- marketing-site-like
- “v0 generated” with oversized cards and loose spacing

Design for engineers making configuration and operational decisions.

---

## Visual principles

### 1. Calm by default
The interface should be visually quiet.
Only one element per section should draw major attention.

Avoid:
- multiple competing accents
- loud success/warning states
- large colored surfaces without purpose
- heavy shadows
- decorative gradients in product UI

Prefer:
- neutral dark surfaces
- subtle borders
- restrained accents
- clear hierarchy through spacing and type

### Canvas / shell background
The main dashboard shell may use the **subtle dot grid** on top of the page background (`dot-pattern` in `apps/dashboard-web/app/globals.css`). This is an intentional, canonical treatment: very low contrast, no extra hue, and it reads as structure rather than branding. It is **not** a license for loud textures, illustrations, or gradient meshes behind operational UI.

### 2. System-first, not page-first
Every screen should feel like it came from the same design system.

Do not design each section independently.
Instead, compose pages from a small set of primitives:
- page header
- section header
- card
- compact stat row
- badge
- button
- input/select
- table/list row
- empty state
- alert/banner

When a new UI need appears, first ask:
“Can this be expressed with existing primitives?”

### 3. Dense but readable
This is a working dashboard, not a landing page.
Use space carefully.

Prefer:
- compact vertical rhythm
- tight grouping of related controls
- horizontal grouping where possible
- shorter card heights
- concise helper text

Avoid:
- oversized padding
- giant empty cards
- excessive whitespace between related controls
- stacking everything vertically when row layout would work better

### 4. States should be subtle
Success, warning, error, and info states should be visible but restrained.

Avoid:
- neon green success panels
- overly saturated callouts
- giant banners for non-critical feedback

Prefer:
- muted tinted backgrounds
- small status badges
- inline feedback near the affected control or section
- compact alerts for high-value status only

---

## Layout rules

### Spacing system
Use a strict 8px base spacing system.

Allowed common values:
- 4
- 8
- 12
- 16
- 24
- 32
- 40
- 48

Do not invent arbitrary spacing values unless truly necessary.

### Page width and rhythm
- Keep content aligned to a clear main column/grid
- Use consistent section gaps
- Use consistent internal card padding
- Align headers, controls, and card boundaries cleanly

### Card usage
Cards should be used for:
- logical grouping
- separation of distinct control areas
- operational summaries

Cards should not be used just to make everything look boxed.

Card styling:
- subtle border
- minimal or no shadow
- restrained radius
- consistent padding
- no decorative gradient fills in standard product surfaces

---

## Typography rules

Typography should do most of the hierarchy work.

### Hierarchy
Use a clear hierarchy:
- page title: strongest
- section title: medium emphasis
- component title: clear but not loud
- label: small, muted
- helper text: smaller, muted
- value/content: standard readable contrast

### Tone
Text should feel direct and technical.

Avoid copy that feels:
- marketing-heavy
- overly enthusiastic
- vague
- filler-heavy

Prefer:
- short labels
- concrete descriptions
- concise helper text
- direct status language

Examples:
- Good: “Cloud target”
- Good: “Local execution is enabled”
- Bad: “Supercharge your local-first workflow”

---

## Color rules

### Canonical palette (dashboard-web)
These values are the **single source of truth for the dashboard palette** as implemented today (`apps/dashboard-web/app/globals.css`). New UI should use theme tokens (Tailwind `background`, `foreground`, `primary`, `border`, etc.) mapped to these variables rather than inventing parallel hex colors.

**Surfaces**

| Token | Value | Role |
| --- | --- | --- |
| `--background` | `#050507` | App / page canvas behind content |
| `--card` | `#0E0E14` | Raised surfaces (cards, panels) |
| `--popover` | `#0E0E14` | Popovers and overlays |
| `--secondary` | `#0A0A0F` | Secondary blocks, chrome-adjacent surfaces |
| `--muted` | `#0D0D13` | Muted fills, sidebar accent hover |

**Text**

| Token | Value | Role |
| --- | --- | --- |
| `--foreground` | `#EAEAF0` | Primary text on dark surfaces |
| `--secondary-foreground` | `#8B8BA3` | Secondary labels and de-emphasized copy |
| `--muted-foreground` | `#8B8BA3` | Helper text, meta, placeholders |

**Accent and focus**

| Token | Value | Role |
| --- | --- | --- |
| `--primary` | `#7C6CFF` | Primary actions, key emphasis, active nav |
| `--accent` | `#7C6CFF` | Same as primary (single purple family) |
| `--primary-foreground` | `#EAEAF0` | Text on primary-filled controls |
| `--ring` | `rgba(124, 108, 255, 0.5)` | Focus ring |

**Borders and inputs**

| Token | Value | Role |
| --- | --- | --- |
| `--border` | `rgba(255, 255, 255, 0.06)` | Default hairline borders |
| `--input` | `rgba(255, 255, 255, 0.06)` | Input borders |

**Semantic**

| Token | Value | Role |
| --- | --- | --- |
| `--destructive` | `#ef4444` | Errors, destructive actions |
| `--destructive-foreground` | `#EAEAF0` | Text on destructive buttons |

**Sidebar (aligned with surfaces above)**

| Token | Value | Role |
| --- | --- | --- |
| `--sidebar` | `#0A0A0F` | Sidebar background |
| `--sidebar-foreground` | `#EAEAF0` | Sidebar text |
| `--sidebar-primary` | `#7C6CFF` | Active / emphasized nav |
| `--sidebar-primary-foreground` | `#EAEAF0` | Text on sidebar primary |
| `--sidebar-accent` | `#0D0D13` | Sidebar row hover / selection fill |
| `--sidebar-accent-foreground` | `#EAEAF0` | Text on sidebar accent |
| `--sidebar-border` | `rgba(255, 255, 255, 0.06)` | Sidebar divider |
| `--sidebar-ring` | `rgba(124, 108, 255, 0.5)` | Sidebar focus ring |

**Charts (sequential purple / indigo ramp — charts only)**

| Token | Value |
| --- | --- |
| `--chart-1` | `#7C6CFF` |
| `--chart-2` | `#6366f1` |
| `--chart-3` | `#8b5cf6` |
| `--chart-4` | `#a78bfa` |
| `--chart-5` | `#c4b5fd` |

**Radius**

| Token | Value |
| --- | --- |
| `--radius` | `0.5rem` (8px) base; `radius-sm` / `radius-md` / `radius-lg` / `radius-xl` derived in theme |

**Dot grid (canvas only)**

| Class / detail | Value |
| --- | --- |
| `dot-pattern` | `radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)`, `24px` tile |

### General
Color usage must be restrained.

Use:
- neutrals for most surfaces
- one primary accent family (the purple above)
- semantic colors only for meaningful state

Avoid:
- multiple accent colors competing on one screen
- bright colored card backgrounds
- decorative color for non-interactive elements

### Semantic states
Success:
- muted green tint only
- usually badge or compact inline alert
- avoid large bright green containers

Warning:
- subdued amber/yellow
- used sparingly

Error:
- clear but not loud red
- reserve for destructive actions and real problems

Primary accent:
- use for selected states, key actions, focus, and active navigation
- do not spread accent color everywhere

---

## Component rules

### Buttons
Use a small number of button variants:
- primary
- secondary
- ghost
- danger

Rules:
- primary only for the main action in a region
- danger only for destructive actions
- secondary/ghost for lower priority actions
- avoid having multiple equally loud buttons side by side

### Badges
Badges should communicate compact state:
- Active
- Succeeded
- Local First
- Connected
- Draft

Badges should be:
- compact
- low-noise
- consistent in padding and radius

### Inputs / selects
Inputs should feel operational and clean.

Rules:
- consistent height
- consistent border treatment
- restrained focus states
- labels above inputs when clarity matters
- helper text only when necessary

### Alerts / banners
Only use a full-width alert/banner when:
- the information materially affects next actions
- the user should notice it immediately

Otherwise, use:
- inline status
- badge
- helper text
- compact callout

### Tables / rows
For operational data, prefer rows/tables over giant cards whenever possible.
Vercel feels professional partly because information is often presented compactly.

When data is list-like, use:
- structured rows
- clear alignment
- consistent columns
- hover affordance if interactive

---

## Interaction rules

Professional feel is heavily affected by interaction polish.

Every interactive component should have:
- hover state
- focus state
- active/pressed state where applicable
- disabled state if applicable
- transition timing that feels fast and subtle

Preferred motion:
- 120–180ms
- subtle opacity, border-color, background-color, or elevation shifts
- no bouncy or decorative animation

Avoid:
- dramatic motion
- delayed hover feedback
- large hover transforms

---

## Dashboard-specific guidance for Dyno

### The dashboard should emphasize:
- projects
- runtime configuration
- cloud/local routing
- execution state
- reliability and operational feedback

### The dashboard should avoid:
- looking like a marketing product tour
- oversized celebratory success UI
- large decorative hero sections
- too many stacked cards with similar visual weight

### For project detail pages
Project detail pages should feel like:
- a control surface
- a configuration console
- an operational overview

Recommended structure:
1. page header
2. compact metadata row
3. key config sections
4. status / journey / health sections
5. destructive actions visually separated and de-emphasized

### Success journey / onboarding sections
These should be useful, not loud.

If a journey is completed:
- collapse by default if appropriate
- show compact success indicator
- avoid large celebratory containers
- make the UI feel like progress is now part of normal operation

---

## Anti-patterns

Do not introduce these without strong reason:

- giant empty cards
- large saturated status panels
- multiple accent colors on one page
- inconsistent corner radius across components
- inconsistent card padding
- decorative gradients in product UI
- oversized buttons
- too much helper text
- centered content in operational dashboards where left alignment is clearer
- one-off section styling that does not map to a reusable pattern
- making every section a “special” section

---

## Refactor priorities when touching existing UI

When improving an existing page, prioritize in this order:

1. fix spacing consistency
2. fix typography hierarchy
3. reduce visual noise
4. standardize components into primitives
5. improve density and grouping
6. add subtle interaction polish
7. remove one-off styling
8. only then consider new visual enhancements

---

## Implementation expectations for Cursor

When editing UI:
- reuse existing primitives before creating new ones
- extract reusable components if repetition appears
- preserve functionality while improving presentation
- do not rewrite working business logic unless required for the UI change
- make changes incrementally and coherently, not randomly across the page

For any substantial UI refactor, explain:
1. what visual/system issues were found
2. what design-system changes were made
3. which primitives were introduced or standardized
4. how the result better matches this file

---

## Definition of done for UI work

A UI task is not done unless:
- spacing follows a clear system
- typography hierarchy is obvious
- color usage is restrained
- components feel related
- interactions have hover/focus polish
- the page feels denser and more intentional
- the result looks more like a developer tool than a template