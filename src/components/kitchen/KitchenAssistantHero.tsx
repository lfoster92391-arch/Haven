import type { MealMatch } from '../../lib/mealEngine'
import styles from './KitchenAssistantHero.module.css'

function timeGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function whyLine(meal: MealMatch): string {
  if (meal.useSoonItems.length > 0) {
    const item = meal.useSoonItems[0]
    return `It gently uses your ${item.toLowerCase()} — one less thing to remember.`
  }
  if (meal.canMake && meal.missingIngredients.length === 0) {
    return 'You already have what you need at home.'
  }
  if (meal.missingIngredients.length === 1) {
    return `Just pick up ${meal.missingIngredients[0].toLowerCase()} and you’re set.`
  }
  if (meal.missingIngredients.length > 1) {
    return `A couple of small things from the store would unlock it.`
  }
  if (meal.cookTimeMinutes) {
    return `About ${meal.cookTimeMinutes} minutes when you’re ready.`
  }
  return 'A calm dinner that fits this kitchen.'
}

export interface KitchenAssistantHeroProps {
  userName?: string
  primary: MealMatch | null
  moreCount: number
  useSoonCount?: number
  onCook?: (meal: MealMatch) => void
  onSeeMore?: () => void
  reference?: Date
}

/**
 * Tonight companion — answers “What should I cook?” in one calm breath.
 * Not a kitchen health score / inventory dashboard.
 */
export function KitchenAssistantHero({
  userName,
  primary,
  moreCount,
  useSoonCount = 0,
  onCook,
  onSeeMore,
  reference = new Date(),
}: KitchenAssistantHeroProps) {
  const name = userName?.trim() || 'there'

  return (
    <section className={styles.hero} aria-label="What should I cook tonight">
      <p className={styles.eyebrow}>Tonight</p>
      <h2 className={styles.greeting}>
        {timeGreeting(reference.getHours())}, {name}
      </h2>

      {primary ? (
        <>
          <p className={styles.lead}>I’d cook this tonight.</p>
          <div className={styles.primary}>
            <p className={styles.mealName}>{primary.name}</p>
            <p className={styles.why}>{whyLine(primary)}</p>
            {onCook && (
              <button
                type="button"
                className={styles.cta}
                onClick={() => onCook(primary)}
              >
                Let’s cook this
              </button>
            )}
          </div>
          {moreCount > 1 && (
            <p className={styles.more}>
              {moreCount - 1} other idea{moreCount - 1 === 1 ? '' : 's'} below
              {useSoonCount > 0
                ? ` · ${useSoonCount} thing${useSoonCount === 1 ? '' : 's'} worth using soon`
                : ''}
              {onSeeMore ? (
                <>
                  {' · '}
                  <button type="button" className={styles.textLink} onClick={onSeeMore}>
                    See more meals
                  </button>
                </>
              ) : null}
            </p>
          )}
          {moreCount <= 1 && useSoonCount > 0 && (
            <p className={styles.more}>
              {useSoonCount} thing{useSoonCount === 1 ? '' : 's'} in the kitchen worth using soon —
              dinner can help.
            </p>
          )}
        </>
      ) : (
        <>
          <p className={styles.lead}>
            I’m still getting to know your kitchen. Show me a shelf, or add a few things you already
            have — then I’ll suggest dinner with confidence.
          </p>
          {onSeeMore && (
            <button type="button" className={styles.ctaSecondary} onClick={onSeeMore}>
              Browse meal ideas
            </button>
          )}
        </>
      )}

      <p className={styles.closing}>You don’t have to figure dinner out alone.</p>
    </section>
  )
}
