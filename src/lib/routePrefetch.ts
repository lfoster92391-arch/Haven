import { deferNonCritical } from './deferWork'

/** Lazy route loaders — used for hover/focus prefetch and idle warm-up. */
export const ROUTE_LOADERS: Record<string, () => Promise<unknown>> = {
  '/': () => import('../pages/DailyBriefing'),
  '/today': () => import('../pages/DecisionCenter'),
  '/decisions': () => import('../pages/DecisionCenter'),
  '/intelligence': () => import('../pages/IntelligenceCenter'),
  '/household-timeline': () => import('../pages/HouseholdTimeline'),
  '/my-life': () => import('../pages/MyLife'),
  '/account': () => import('../pages/Account'),
  '/connections': () => import('../pages/Connections'),
  '/household': () => import('../pages/Household'),
  '/preparedness': () => import('../pages/Preparedness'),
  '/scan': () => import('../pages/Scan'),
  '/kitchen': () => import('../pages/Kitchen'),
  '/pantry': () => import('../pages/Pantry'),
  '/coupons': () => import('../pages/Coupons'),
  '/savings': () => import('../pages/Coupons'),
  '/meals': () => import('../pages/Meals'),
  '/finance': () => import('../pages/Finance'),
  '/wellness': () => import('../pages/Wellness'),
  '/village': () => import('../pages/Village'),
  '/forge': () => import('../pages/Forge'),
  '/forge/build': () => import('../pages/ForgeBuildDetail'),
}

const prefetched = new Set<string>()

function isMobilePhone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 768px)').matches
}

export function prefetchRoute(path: string): void {
  const loader = ROUTE_LOADERS[path]
  if (!loader || prefetched.has(path)) return
  prefetched.add(path)
  loader().catch(() => prefetched.delete(path))
}

/** Warm frequently-used routes after first paint — skip entirely on phones. */
export function prefetchCommonRoutesOnIdle(): void {
  if (isMobilePhone()) return

  deferNonCritical(() => {
    for (const path of [
      '/kitchen',
      '/pantry',
      '/coupons',
      '/today',
      '/household',
      '/my-life',
      '/intelligence',
    ]) {
      prefetchRoute(path)
    }
  }, 4000)
}
