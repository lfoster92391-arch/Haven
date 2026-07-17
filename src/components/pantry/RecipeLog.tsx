import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  displayRecipeName,
  getRecipeLogEntries,
  type MealLearningProfile,
} from '../../lib/mealLearning'
import styles from './RecipeLog.module.css'

export function RecipeLog() {
  const [entries, setEntries] = useState<MealLearningProfile[]>([])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void getRecipeLogEntries(10).then(list => {
        if (!cancelled) setEntries(list)
      })
    }
    load()
    window.addEventListener('haven:recipe-log-updated', load)
    return () => {
      cancelled = true
      window.removeEventListener('haven:recipe-log-updated', load)
    }
  }, [])

  if (entries.length === 0) return null

  return (
    <section className={styles.section} aria-label="Recipe Log">
      <h3 className={styles.title}>Recipe Log</h3>
      <p className={styles.sub}>Your versions — what Haven remembers from nights you cooked.</p>
      <ul className={styles.list}>
        {entries.map(entry => (
          <li key={entry.recipeKey} className={styles.item}>
            <div className={styles.row}>
              <span className={styles.name}>{displayRecipeName(entry)}</span>
              {entry.cookCount > 0 && (
                <span className={styles.meta}>
                  Cooked {entry.cookCount}×
                  {entry.lastCookedAt
                    ? ` · ${format(parseISO(entry.lastCookedAt), 'MMM d')}`
                    : ''}
                </span>
              )}
            </div>
            {entry.personalName && entry.personalName !== entry.recipeName && (
              <p className={styles.from}>From {entry.recipeName}</p>
            )}
            {entry.lastCookNote && (
              <p className={styles.note}>{entry.lastCookNote}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
