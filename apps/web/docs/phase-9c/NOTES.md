# Phase 9C — Application shell & organization dashboard

## Contrast fix (pre-9C)

Global `h1–h3` colour forced navy text on navy heroes. Headings now inherit parent colour; landing hero/CTA use explicit `text-white`.

## Shell

- `WorkspaceShell` wraps all `/organizations/[orgId]/*` routes via layout.
- Sidebar: logo, org switcher, permission-aware nav, collapse (persisted), mobile drawer.
- Top bar: breadcrumbs, role, account menu, sign-out.
- Existing SiteHeader removed from workspace pages to avoid double chrome.

## Dashboard

- Loads real documents, diagnostics and reports from existing APIs.
- Shows health score only when present and not ineligible; never fabricates metrics.
- Action centre derives next steps from backend status + permissions.
- Empty state when the workspace has no documents/runs/reports.

## Screenshots

| File | Subject |
|------|---------|
| `landing-hero-desktop-1440.png` | Contrast fix — white hero headline on navy |
| `landing-hero-mobile-375.png` | Contrast fix — mobile |
| `dashboard-desktop-1440-fixture.png` | Shell + dashboard with labelled fixture data |
| `dashboard-mobile-375-fixture.png` | Mobile fixture dashboard |
| `sidebar-expanded-1440.png` | Expanded sidebar |
| `sidebar-collapsed-1440.png` | Collapsed sidebar |
| `mobile-nav-drawer-375.png` | Mobile navigation drawer |
| `dashboard-empty-1440.png` | Empty dashboard state |

Fixture UI: `/design-system/workspace` (explicitly labelled sample data). Live shell: `/organizations/[orgId]`.

## Known limitations

- Child pages (documents, diagnostics, etc.) retain prior internal layouts; shell provides chrome only.
- Collapsed sidebar uses first-letter nav labels (desktop space trade-off).
- Dashboard does not poll; refresh on navigation/remount.
- Organizations list (`/organizations`) remains a public-header selector, not the workspace shell.
- Authenticated live-data screenshots require a signed-in staging session; 9C visual evidence uses labelled fixtures.
