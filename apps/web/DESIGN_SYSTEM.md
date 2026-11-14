# Opero Design System — Phase 9

## Audit (pre-9A)

### Tokens (legacy)

Defined in `src/app/globals.css` via Tailwind v4 `@theme`:

| Token | Value | Usage |
|-------|-------|--------|
| `paper` | `#f3efe6` | Page background (warm cream) |
| `ink` | `#1c1915` | Primary text |
| `pine` / `pine-dark` | `#1e4d3a` / `#143528` | Primary actions |
| `copper` | `#8a4e2b` | Focus / accent |
| `line` | `#e3d9cc` | Borders |
| `muted` | `#5e574e` | Secondary text |

### Typography (legacy)

- **Display:** Fraunces (`--font-display`) applied globally to all `h1–h3`
- **UI:** Source Sans 3 (`--font-sans`)
- No dedicated tabular/data face

### Layout patterns

- Public pages: centered `max-w-5xl` / `max-w-6xl` shells with top header + `AuthNav`
- Auth: `AuthForm` card on paper background
- Org pages: flat stacks of rounded-full CTAs; no persistent sidebar
- Documents: Phase 8 processing timeline + inline review forms
- Billing / diagnostics: mostly raw JSON / simple lists

### Reusable components (pre-9A)

| Component | Role |
|-----------|------|
| `site-header` | Minimal public/org header |
| `auth-nav` / `auth-form` | Session chrome + auth forms |
| `document-upload-form` | Upload UX |
| `processing-timeline` | Phase 8 pipeline status |
| `statement-metadata` | Extraction metadata panel |
| `public-env-script` | Runtime env injection |

No shared Button / Input / Card / Dialog primitives — pages inlined Tailwind utility clusters.

---

## 9A — Foundation

### Brand colours

| Role | Hex | Token |
|------|-----|--------|
| Primary navy | `#101D32` | `--color-navy` / `ink` |
| Primary emerald | `#087F6D` | `--color-emerald` / `pine` |
| Premium gold | `#D6A85B` | `--color-gold` / `copper` |
| Workspace | `#F7F9FC` | `--color-workspace` / `paper` |
| Secondary slate | `#64748B` | `--color-slate` / `muted` |
| Information surface | `#EAF2F8` | `--color-info-surface` |

Legacy utility names (`bg-pine`, `text-ink`, …) alias the new palette so existing screens pick up identity without a big-bang rewrite.

### Typography

| Role | Face | CSS variable | Utility |
|------|------|--------------|---------|
| UI / marketing body | Plus Jakarta Sans | `--font-sans` | default body |
| Data tables / figures | Inter (tabular nums) | `--font-data` | `.font-data` |
| Editorial / report titles | DM Serif Display | `--font-display` | `.font-display` |

Headings default to Plus Jakarta Sans. DM Serif is **opt-in** for premium editorial surfaces only.

### Component primitives

Located in `src/components/ui/`. Single design system — do not introduce a parallel library.

Review specimen: `/design-system` (9A preview only; not a public marketing surface).

## 9B — Public website & authentication

- Marketing header/footer + landing page (`/`) with X-Ray positioning, how-it-works, capabilities, pricing CTA
- Premium auth shell (`AuthShell`) with desktop branded panel + form card
- Auth forms use 9A Input/Button/Alert; removed `.data/mail` development copy
- Pricing page restyled to match brand (catalog API unchanged)
- Logo mark: aperture + X-Ray scan beam (`OperoMark` / `OperoLogo`) — favicon, nav, auth, reports-ready
- Visual refinement: shorter hero, stronger product visual, metric strip, tighter auth/mobile register

### Later increments

- **9C** App shell + org dashboard
- **9D** Documents / extraction
- **9E** Diagnostics / AI
- **9F** Reports / billing / settings
- **9G** Responsive / a11y / visual regression
