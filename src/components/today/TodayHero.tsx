import styles from './TodayHero.module.css'
import type { TodayDecision } from '../../lib/today/todayTypes'

function timeGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export interface TodayHeroProps {
  userName?: string
  decisionCount: number
  dayWeight: 'light' | 'moderate' | 'heavy'
  /** Clearest next move — one ask, not a dashboard */
  primary?: TodayDecision | null
  onPrimaryAction?: (decision: TodayDecision) => void
  primaryBusy?: boolean
  reference?: Date
}

const DAY_COPY: Record<TodayHeroProps['dayWeight'], { lead: string; closing: string }> = {
  light: {
    lead: 'Today looks gentle. I’ve got a few small things — the rest can wait.',
    closing: 'Then you’re done. Enjoy your evening.',
  },
  moderate: {
    lead: 'A balanced day. Here’s the one thing that would make today easier.',
    closing: 'Then you’re in good shape for the rest of the day.',
  },
  heavy: {
    lead: 'There’s a little more on your plate. Let’s start with one calm step.',
    closing: 'The essentials first — everything else can wait.',
  },
}

export function TodayHero({
  userName,
  decisionCount,
  dayWeight,
  primary,
  onPrimaryAction,
  primaryBusy,
  reference = new Date(),
}: TodayHeroProps) {
  const name = userName?.trim() || 'there'
  const copy = DAY_COPY[dayWeight]

  return (
    <section className={styles.hero} aria-label="How today can be easier">
      <p className={styles.eyebrow}>Life</p>
      <h2 className={styles.greeting}>
        {timeGreeting(reference.getHours())}, {name}
      </h2>
      <p className={styles.summary}>
        {decisionCount === 0
          ? 'Nothing needs you right now. Go enjoy your day — I’ve got the rest.'
          : copy.lead}
      </p>

      {primary && (
        <div className={styles.primary}>
          <p className={styles.primaryLabel}>Start here</p>
          <p className={styles.primaryTitle}>{primary.title}</p>
          {(primary.subtitle || primary.reasons[0]) && (
            <p className={styles.primaryWhy}>{primary.subtitle || primary.reasons[0]}</p>
          )}
          {primary.actionLabel && onPrimaryAction && (
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={primaryBusy}
              onClick={() => onPrimaryAction(primary)}
            >
              {primaryBusy ? 'One moment…' : primary.actionLabel}
            </button>
          )}
        </div>
      )}

      {decisionCount > 0 && (
        <p className={styles.stats}>
          {decisionCount === 1
            ? 'Just one thing when you’re ready.'
            : `${decisionCount} small things when you’re ready — no rush.`}
        </p>
      )}

      {decisionCount > 0 && <p className={styles.closing}>{copy.closing}</p>}
    </section>
  )
}
