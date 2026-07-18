import { ActionMenu } from '../ui/ActionMenu'
import {
  MealRecommendationActions,
  isMealRecommendation,
} from '../meals/MealRecommendationActions'
import { mealContextFromPayload } from '../../lib/mealRecommendationActions'
import { WhyAmISeeingThis } from '../intelligence/WhyAmISeeingThis'
import {
  TODAY_MODULE_LABELS,
  type TodayDecision,
} from '../../lib/today/todayTypes'
import { isBetaSimplifiedUi } from '../../lib/betaFeatures'
import styles from './TodayDecisionCard.module.css'

const SOFTWARE_REASON = /\d+%\s*confidence|priority|score/i

function softWhy(decision: TodayDecision): string | undefined {
  const candidates = [decision.subtitle, ...decision.reasons].filter(
    (line): line is string => Boolean(line?.trim()) && !SOFTWARE_REASON.test(line),
  )
  return candidates[0]
}

export interface TodayDecisionCardProps {
  decision: TodayDecision
  busy?: boolean
  hasSmartHomeConnected?: boolean
  onAction: (decision: TodayDecision) => void
  onSnooze?: (observationId: number) => void
  onDismiss?: (observationId: number) => void
}

/**
 * Calm Life note — one helpful ask under the companion hero.
 * Not a priority ticket, module badge row, or confidence meter.
 */
export function TodayDecisionCard({
  decision,
  busy,
  hasSmartHomeConnected = false,
  onAction,
  onSnooze,
  onDismiss,
}: TodayDecisionCardProps) {
  const beta = isBetaSimplifiedUi()
  const moduleLabel = TODAY_MODULE_LABELS[decision.module]
  const why = softWhy(decision)

  const menuItems = []
  if (decision.observationId && onSnooze) {
    menuItems.push({
      label: 'Remind me later',
      onClick: () => onSnooze(decision.observationId!),
    })
  }
  if (decision.observationId && onDismiss) {
    menuItems.push({
      label: 'I’ve got this',
      onClick: () => onDismiss(decision.observationId!),
    })
  }

  const mealContext = mealContextFromPayload(decision.actionPayload, 'today')
  const showMealActions = isMealRecommendation(decision.module, decision.actionPayload) && mealContext
  const extraReasons = decision.reasons
    .filter(r => r !== why && !SOFTWARE_REASON.test(r))
    .slice(0, 2)

  const showHeader = (!beta && Boolean(moduleLabel)) || decision.isDemo || menuItems.length > 0

  return (
    <article className={styles.card} data-module={decision.module}>
      {showHeader && (
        <div className={styles.header}>
          {!beta && <span className={styles.area}>{moduleLabel}</span>}
          {decision.isDemo && <span className={styles.example}>Example</span>}
          {menuItems.length > 0 && (
            <ActionMenu iconOnly label="More" items={menuItems} />
          )}
        </div>
      )}

      <h3 className={styles.title}>{decision.title}</h3>

      {why && <p className={styles.why}>{why}</p>}

      {!beta && extraReasons.length > 0 && (
        <ul className={styles.reasons}>
          {extraReasons.map(reason => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}

      {!beta && decision.metric && (
        <p className={styles.metric}>
          {decision.metric.label} {decision.metric.value}
        </p>
      )}

      {!beta && (
        <WhyAmISeeingThis
          reasons={decision.whyExplanation}
          evidenceSources={decision.evidenceSources}
          hasSmartHomeConnected={hasSmartHomeConnected}
          isDemo={decision.isDemo}
        />
      )}

      {showMealActions ? (
        <MealRecommendationActions context={mealContext} />
      ) : (
        <button
          type="button"
          className={styles.actionBtn}
          disabled={busy}
          onClick={() => onAction(decision)}
        >
          {busy ? 'One moment…' : decision.actionLabel}
        </button>
      )}
    </article>
  )
}
