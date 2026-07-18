import { Link } from 'react-router-dom'
import { useHouseholdCommandCenter } from '../../hooks/useHouseholdCommandCenter'
import { useLivingHeart } from '../../hooks/useLivingHeart'
import { isBetaSimplifiedUi } from '../../lib/betaFeatures'
import { openAskHaven } from '../../lib/havenChat/askHavenEvents'
import { WelcomeHomeHero } from './WelcomeHomeHero'
import {
  ComingUpFocus,
  GamePlanSection,
  HomeStatusStrip,
  HouseholdSnapshotSection,
  NextTripCard,
  OpportunitiesSection,
  SavingsJourneySection,
  WeekWinsSection,
} from './HomeVisionSections'
import { CreateAccountCard } from './CreateAccountCard'
import { HavenAlreadyHelpedCard } from './HavenAlreadyHelpedCard'
import { HavenMemoriesCard } from './HavenMemoriesCard'
import { LearnBathroomCard } from './LearnBathroomCard'
import { HavenNoticedCard } from './HavenNoticedCard'
import { CelebrateMomentsCard } from './CelebrateMomentsCard'
import { HouseholdLearningProgress } from './HouseholdLearningProgress'
import { PreparednessDashboard } from './PreparednessDashboard'
import styles from './householdCommandCenter.module.css'

export function HouseholdCommandCenterView() {
  const { brief, deferredReady } = useHouseholdCommandCenter()
  const { scene: livingHeartScene, loading: livingHeartLoading } = useLivingHeart()
  const beta = isBetaSimplifiedUi()
  const smartHomeConnected = false

  const vision = brief?.homeVision ?? null

  const noticedForBeta = (brief?.noticed ?? []).filter(
    n => n.id === 'buy-connected' || n.id === 'pantry-match',
  )

  const celebrateForBeta = (brief?.celebrate ?? []).filter(
    m => !/christmas|countdown|prepared/i.test(`${m.title} ${m.text}`),
  )

  return (
    <div className={styles.page} aria-label="Home">
      <WelcomeHomeHero
        scene={livingHeartScene}
        loading={livingHeartLoading || !deferredReady}
        vision={vision}
      />

      <CreateAccountCard />

      {deferredReady && brief && vision ? (
        <>
          <HomeStatusStrip checks={vision.statusChecks ?? []} />
          <GamePlanSection cards={vision.gamePlan ?? []} />
          <NextTripCard trip={vision.nextTrip ?? null} />
          <HouseholdSnapshotSection areas={vision.householdAreas ?? []} />
          <ComingUpFocus items={vision.comingUp ?? []} onAskHaven={() => openAskHaven()} />

          <HavenAlreadyHelpedCard items={brief.alreadyHelped} />

          <HavenMemoriesCard />

          <LearnBathroomCard />

          <HavenNoticedCard
            insights={(beta ? noticedForBeta : brief.noticed).slice(0, 2)}
            hasSmartHomeConnected={smartHomeConnected}
          />

          <WeekWinsSection wins={vision.weekWins ?? []} />
          <OpportunitiesSection items={vision.opportunities ?? []} />
          <SavingsJourneySection journey={vision.savingsJourney ?? null} />

          {beta && celebrateForBeta.length > 0 && (vision.weekWins ?? []).length === 0 && (
            <CelebrateMomentsCard moments={celebrateForBeta.slice(0, 1)} />
          )}
          {!beta && (vision.weekWins ?? []).length === 0 && (
            <CelebrateMomentsCard moments={brief.celebrate} />
          )}
          {!beta && brief.learning && <HouseholdLearningProgress data={brief.learning} />}
          {!beta && brief.preparedness && <PreparednessDashboard data={brief.preparedness} />}
        </>
      ) : (
        <section className={styles.card} aria-busy="true" aria-label="Looking up your home">
          <p className={styles.sectionLabel}>Looking…</p>
          <div className={styles.skeleton} />
          <div className={styles.skeleton} />
        </section>
      )}

      <nav className={styles.linkRows} aria-label="Explore Haven">
        <Link to="/today" className={styles.linkRow}>
          <span>Life</span>
          <span className={styles.linkArrow}>→</span>
        </Link>
        <Link to="/finance" className={styles.linkRow}>
          <span>Finance</span>
          <span className={styles.linkArrow}>→</span>
        </Link>
        <Link to="/savings" className={styles.linkRow}>
          <span>Savings</span>
          <span className={styles.linkArrow}>→</span>
        </Link>
        <Link to="/kitchen" className={styles.linkRow}>
          <span>Kitchen</span>
          <span className={styles.linkArrow}>→</span>
        </Link>
        {!beta && (
          <>
            <Link to="/household-timeline" className={styles.linkRow}>
              <span>Timeline</span>
              <span className={styles.linkArrow}>→</span>
            </Link>
            <Link to="/connections" className={styles.linkRow}>
              <span>Connections</span>
              <span className={styles.linkArrow}>→</span>
            </Link>
          </>
        )}
      </nav>
    </div>
  )
}
