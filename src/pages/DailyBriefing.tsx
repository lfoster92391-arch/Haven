import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Link, useSearchParams } from 'react-router-dom'
import { LifeSetupCard } from '../components/LifeSetupCard'
import { PageHeader } from '../components/PageHeader'
import { HouseholdCommandCenterView } from '../components/householdCommandCenter/HouseholdCommandCenterView'
import { useLifeProfile } from '../hooks/useHavenData'
import { BETA_BANNER_COPY, isBetaSimplifiedUi } from '../lib/betaFeatures'
import { getBriefingDate } from '../content/foodDaysAndHolidays'
import styles from './DailyBriefing.module.css'

export function DailyBriefing() {
  const lifeProfile = useLifeProfile()
  const [showLifeEdit, setShowLifeEdit] = useState(false)
  const [searchParams] = useSearchParams()
  const briefingDate = useMemo(() => getBriefingDate(searchParams), [searchParams])
  const today = format(briefingDate, 'EEEE, MMMM d')
  const showLifeSetup = !lifeProfile?.setupComplete || showLifeEdit
  const beta = isBetaSimplifiedUi()

  return (
    <div className={styles.page}>
      {/* Beta: WelcomeHomeHero is the welcome — skip cold page chrome */}
      {!beta && <PageHeader icon="🌿" title="Home" subtitle={today} />}

      {beta && (
        <p className={styles.whisper} role="status">
          {BETA_BANNER_COPY}
        </p>
      )}

      {showLifeSetup ? (
        <LifeSetupCard
          existing={lifeProfile}
          onComplete={() => setShowLifeEdit(false)}
        />
      ) : (
        <HouseholdCommandCenterView />
      )}

      {!lifeProfile?.setupComplete && !showLifeSetup && (
        <p className={styles.setupNudge}>
          <Link to="/my-life">Personalize Haven for your life →</Link>
        </p>
      )}

      {!showLifeSetup && !beta && (
        <p className={styles.setupNudge}>
          <Link to="/my-life">Edit life profile →</Link>
        </p>
      )}
    </div>
  )
}
