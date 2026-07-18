import { PageHeader } from '../components/PageHeader'
import { TodayInbox } from '../components/today/TodayInbox'
import { useToday } from '../hooks/useToday'
import { BETA_BANNER_COPY, isBetaSimplifiedUi } from '../lib/betaFeatures'
import styles from './DecisionCenter.module.css'

export function DecisionCenter() {
  const { snapshot, loading, userName, refresh, dismiss, snooze } = useToday()
  const beta = isBetaSimplifiedUi()

  return (
    <div className={styles.page}>
      <PageHeader
        icon="🌿"
        title="Life"
        subtitle="How can I make today easier?"
      />
      {beta && (
        <p className={styles.betaBanner} role="status">
          {BETA_BANNER_COPY}
        </p>
      )}
      <TodayInbox
        snapshot={snapshot}
        loading={loading}
        userName={userName}
        onRefresh={() => refresh('manual')}
        onSnooze={snooze}
        onDismiss={dismiss}
      />
    </div>
  )
}
