import type { Bill } from '../../db/database'
import { formatBillDueLabel } from '../../lib/billSchedule'
import styles from './MoneyAssistantHero.module.css'

function timeGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatMoney(amount: number): string {
  return `$${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`
}

export interface MoneyTopCategory {
  category: string
  total: number
}

export interface MoneyAssistantHeroProps {
  userName?: string
  /** Next unpaid bill (soonest due) */
  nextBill?: Bill | null
  overdueCount: number
  unpaidCount: number
  unpaidTotal: number
  topCategory?: MoneyTopCategory | null
  monthSpendTotal?: number
  hasAnyBills: boolean
  onSeeDue?: () => void
  onCareForBill?: (bill: Bill) => void
  reference?: Date
}

/**
 * Money companion — answers “Where is my money going?” in one calm breath.
 * Not a bill spreadsheet or financial health scorecard.
 */
export function MoneyAssistantHero({
  userName,
  nextBill,
  overdueCount,
  unpaidCount,
  unpaidTotal,
  topCategory,
  monthSpendTotal = 0,
  hasAnyBills,
  onSeeDue,
  onCareForBill,
  reference = new Date(),
}: MoneyAssistantHeroProps) {
  const name = userName?.trim() || 'there'
  const empty = !hasAnyBills && monthSpendTotal <= 0 && unpaidCount === 0

  let lead: string
  if (empty) {
    lead =
      'I’m still getting to know where your money goes. Add a bill or a receipt — then I’ll keep an eye on it for you.'
  } else if (overdueCount > 0) {
    lead =
      overdueCount === 1
        ? 'One bill is past due. We’ll take it gently — no rush, just clarity.'
        : `${overdueCount} bills are past due. We’ll take them one at a time.`
  } else if (unpaidCount > 0 && nextBill) {
    lead =
      unpaidCount === 1
        ? 'Here’s what still needs you this cycle.'
        : 'A few things are still open. Here’s the one I’d tend first.'
  } else if (topCategory && topCategory.total > 0) {
    lead = 'Here’s where most of your money went this month.'
  } else if (unpaidCount === 0 && hasAnyBills) {
    lead = 'Bills look caught up. Nothing urgent needs you right now.'
  } else {
    lead = 'I’m watching what’s due so you don’t have to hold it all.'
  }

  const showBillPrimary = Boolean(nextBill && unpaidCount > 0)
  const showSpendPrimary = !showBillPrimary && Boolean(topCategory && topCategory.total > 0)

  return (
    <section className={styles.hero} aria-label="Where is my money going">
      <p className={styles.eyebrow}>Money</p>
      <h2 className={styles.greeting}>
        {timeGreeting(reference.getHours())}, {name}
      </h2>
      <p className={styles.lead}>{lead}</p>

      {showBillPrimary && nextBill && (
        <div className={styles.primary}>
          <p className={styles.primaryLabel}>
            {overdueCount > 0 ? 'Tend first' : 'Coming up'}
          </p>
          <p className={styles.primaryTitle}>{nextBill.name}</p>
          <p className={styles.why}>
            {formatMoney(nextBill.amount)} · {formatBillDueLabel(nextBill, reference)}
          </p>
          {onCareForBill ? (
            <button
              type="button"
              className={styles.cta}
              onClick={() => onCareForBill(nextBill)}
            >
              Mark as paid
            </button>
          ) : onSeeDue ? (
            <button type="button" className={styles.cta} onClick={onSeeDue}>
              See what’s due
            </button>
          ) : null}
        </div>
      )}

      {showSpendPrimary && topCategory && (
        <div className={styles.primary}>
          <p className={styles.primaryLabel}>This month</p>
          <p className={styles.primaryTitle}>{topCategory.category}</p>
          <p className={styles.why}>
            About {formatMoney(topCategory.total)}
            {monthSpendTotal > topCategory.total
              ? ` of ${formatMoney(monthSpendTotal)} you’ve logged`
              : ' so far'}
            .
          </p>
          {onSeeDue && hasAnyBills && (
            <button type="button" className={styles.ctaSecondary} onClick={onSeeDue}>
              Peek at bills
            </button>
          )}
        </div>
      )}

      {!empty && unpaidCount > 0 && (
        <p className={styles.more}>
          {unpaidCount === 1
            ? `${formatMoney(unpaidTotal)} still open this cycle`
            : `${unpaidCount} still open · ${formatMoney(unpaidTotal)}`}
          {onSeeDue && showBillPrimary ? (
            <>
              {' · '}
              <button type="button" className={styles.textLink} onClick={onSeeDue}>
                See all due
              </button>
            </>
          ) : null}
        </p>
      )}

      {!empty && unpaidCount === 0 && topCategory && showBillPrimary === false && monthSpendTotal > 0 && (
        <p className={styles.more}>
          {formatMoney(monthSpendTotal)} logged this month — I’ll keep noticing patterns.
        </p>
      )}

      {empty && onSeeDue && (
        <button type="button" className={styles.ctaSecondary} onClick={onSeeDue}>
          Add your first bill
        </button>
      )}

      <p className={styles.closing}>You don’t have to remember every due date alone.</p>
    </section>
  )
}
