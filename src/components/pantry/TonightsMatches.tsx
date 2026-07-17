import type { MealSuggestion } from '../../lib/mealSuggestionEngine'
import { MealRecommendationActions } from '../meals/MealRecommendationActions'
import { mealContextFromMatch } from '../../lib/mealRecommendationActions'
import styles from './TonightsMatches.module.css'

function matchPercent(meal: MealSuggestion): number {
  return meal.confidence ?? meal.score
}

function ingredientLine(meal: MealSuggestion): string {
  const used = [...meal.haveIngredients, ...meal.haveSpices].slice(0, 4)
  if (used.length === 0) return `Uses ${meal.pantryItemCount} pantry items`
  return `Uses: ${used.map(i => `✓ ${i}`).join(' ')}`
}

interface TonightsMatchesProps {
  meals: MealSuggestion[]
  onSelectMeal: (meal: MealSuggestion) => void
  onViewAll: () => void
  maxVisible?: number
}

export function TonightsMatches({ meals, onSelectMeal, onViewAll, maxVisible = 8 }: TonightsMatchesProps) {
  if (meals.length === 0) return null

  return (
    <section className={styles.section} aria-label="Cook Tonight">
      <h3 className={styles.title}>Cook Tonight</h3>
      <p className={styles.sub}>What fits your kitchen right now</p>
      <ul className={styles.carousel}>
        {meals.slice(0, maxVisible).map(meal => {
          const pct = matchPercent(meal)
          const save = meal.wastePrevented > 0 ? ` | Save $${Math.round(meal.wastePrevented)}` : ''
          return (
            <li key={meal.id} className={styles.item}>
              <button type="button" className={styles.match} onClick={() => onSelectMeal(meal)}>
                <div className={styles.matchHeader}>
                  <span className={styles.matchName}>{meal.name}</span>
                  <span className={styles.matchPct}>— {pct}% Match</span>
                </div>
                <span className={styles.sourceBadge}>{meal.sourceLabel}</span>
                <p className={styles.matchDetail}>
                  {ingredientLine(meal)}{save}
                </p>
                {meal.substitutedIngredients.length > 0 && (
                  <p className={styles.subLine}>
                    Sub: {meal.substitutedIngredients.slice(0, 2).map(s => `${s.original} → ${s.substitute}`).join('; ')}
                  </p>
                )}
              </button>
              <MealRecommendationActions
                context={mealContextFromMatch(meal, 'kitchen')}
                compact
                primaryLabel="Cook Tonight"
              />
            </li>
          )
        })}
      </ul>
      <button type="button" className={styles.viewAll} onClick={onViewAll}>
        View All →
      </button>
    </section>
  )
}
