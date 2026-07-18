import { lazy, Suspense } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FOUNDER_VISION } from '../content/founderVision'
import { MODULES } from '../lib/homepilot'
import { isBetaLockdownEnabled, isBetaNavModule } from '../lib/betaFeatures'
import { prefetchRoute } from '../lib/routePrefetch'
import { useLifeProfile } from '../hooks/useHavenData'
import { isForgeEnabled } from '../lib/lifeProfileDefaults'
import { SyncBanner } from './SyncBanner'
import styles from './Layout.module.css'

const AskHavenBar = lazy(() =>
  import('./AskHavenBar').then(m => ({ default: m.AskHavenBar })),
)
const ScanFab = lazy(() => import('./ScanFab').then(m => ({ default: m.ScanFab })))
const HelpHavenLearnLeaf = lazy(() =>
  import('./HelpHavenLearnLeaf').then(m => ({ default: m.HelpHavenLearnLeaf })),
)
const FoundersWelcomeCard = lazy(() =>
  import('./FoundersWelcomeCard').then(m => ({ default: m.FoundersWelcomeCard })),
)
const FoundersRememberedCard = lazy(() =>
  import('./FoundersRememberedCard').then(m => ({ default: m.FoundersRememberedCard })),
)
const BetaHeartbeat = lazy(() =>
  import('./BetaHeartbeat').then(m => ({ default: m.BetaHeartbeat })),
)
const BetaFeedbackHost = lazy(() =>
  import('./BetaFeedbackHost').then(m => ({ default: m.BetaFeedbackHost })),
)

interface LayoutProps {
  children: React.ReactNode
}

function isNavActive(mod: (typeof MODULES)[number], pathname: string): boolean {
  if (mod.id === 'pantry') {
    return pathname === '/pantry'
  }
  if (mod.id === 'kitchen') {
    return pathname === '/kitchen' || pathname === '/pantry' || pathname === '/meals'
  }
  if (mod.id === 'coupons') {
    return pathname === '/savings' || pathname === '/coupons' || pathname === '/shopping'
  }
  if (mod.id === 'decisions') {
    return pathname === '/today' || pathname === '/decisions'
  }
  return pathname === mod.path
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const lifeProfile = useLifeProfile()
  const lockdown = isBetaLockdownEnabled()
  const modules = MODULES.filter(m => {
    if (lockdown && !isBetaNavModule(m.id)) return false
    return m.id !== 'forge' || isForgeEnabled(lifeProfile)
  })

  const showScanFab = location.pathname !== '/scan'

  return (
    <div className={`${styles.layout}${showScanFab ? ` ${styles.withScanFab}` : ''}`}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src="/logo.png" alt="Haven" className={styles.logo} decoding="async" />
          <div className={styles.brandText}>
            <h1 className={styles.brandName}>Haven</h1>
            <p className={styles.tagline}>Welcome home.</p>
          </div>
        </div>

        <nav className={styles.nav}>
          {modules.map(mod => (
            <Link
              key={mod.id}
              to={mod.path}
              className={`${styles.navItem} ${isNavActive(mod, location.pathname) ? styles.active : ''}`}
              onMouseEnter={() => prefetchRoute(mod.path)}
              onFocus={() => prefetchRoute(mod.path)}
            >
              <span className={styles.navIcon}>{mod.icon}</span>
              <span className={styles.navLabel}>{mod.name}</span>
              <span className={styles.navLabelShort}>{mod.shortName}</span>
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <Link to="/account" className={styles.visionLink}>Account & Sync</Link>
          {!lockdown && <Link to="/welcome" className={styles.visionLink}>Welcome setup</Link>}
          <Link to="/vision" className={styles.visionLink}>Why Haven Exists</Link>
          <Link to="/support" className={styles.visionLink}>Support Haven</Link>
          <a href={`mailto:${FOUNDER_VISION.contact.email}`} className={styles.visionLink}>Contact us</a>
          <p className={styles.offlineBadge}>Ready offline</p>
        </div>
      </aside>

      <main className={styles.main} data-scroll-root>
        <SyncBanner />
        <Suspense fallback={null}>
          <AskHavenBar />
        </Suspense>
        {children}
      </main>
      <Suspense fallback={null}>
        {showScanFab && <ScanFab />}
        <HelpHavenLearnLeaf besideFab={showScanFab} />
        <FoundersWelcomeCard />
        <FoundersRememberedCard />
        <BetaHeartbeat />
        <BetaFeedbackHost />
      </Suspense>
    </div>
  )
}
