import { PublicHeader } from "./marketing/public-header";

/** Public site chrome — prefers the Phase 9B marketing header. */
export function SiteHeader({ mark: _mark }: { mark?: string } = {}) {
  return <PublicHeader compact />;
}
