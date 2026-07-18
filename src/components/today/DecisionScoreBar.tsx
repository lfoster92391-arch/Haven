import type { TodayStats } from '../../lib/today/todayTypes'
import styles from './DecisionScoreBar.module.css'

export interface DecisionScoreBarProps {
  stats: TodayStats
}

export function DecisionScoreBar({ stats }: DecisionScoreBarProps) {
  return (
    <div className={styles.bar} role="group" aria-label="Today's decision stats">
      <div className={styles.row}>
        <span className={styles.stat}>
          <strong>{stats.totalDecisions}</strong> Today&apos;s Decisions
        </span>
        <span className={styles.divider}>|</span>
        <span className={styles.stat}>
          <strong>{stats.highPriority}</strong> High Priority
        </span>
        <span className={styles.divider}>|</span>
        <span className={styles.stat}>
          <strong>{stats.quickWins}</strong> Quick Wins
        </span>
      </div>
      <div className={styles.row}>
        <span className={styles.stat}>
          Potential Savings <strong>${stats.potentialSavings.toFixed(0)}</strong>
        </span>
        <span className={styles.divider}>|</span>
        <span className={styles.stat}>
          Time Required <strong>{stats.timeMinutes} min</strong>
        </span>
      </div>
    </div>
  )
}
