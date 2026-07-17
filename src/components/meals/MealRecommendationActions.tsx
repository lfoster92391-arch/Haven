import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { RecipeFeedbackTag } from '../../db/database'
import {
  addMissingToShoppingList,
  finalizeMealCooked,
  letsMakeIt,
  saveMealRating,
  type MealRecommendationContext,
} from '../../lib/mealRecommendationActions'
import styles from './MealRecommendationActions.module.css'

type Phase = 'actions' | 'confirm' | 'learning' | 'name' | 'done'

const CHANGE_CHIPS: { id: RecipeFeedbackTag; label: string }[] = [
  { id: 'added-ingredients', label: 'Added something' },
  { id: 'removed-ingredients', label: 'Skipped something' },
  { id: 'changed-amounts', label: 'Changed amounts' },
  { id: 'turned-out-great', label: 'Turned out great' },
  { id: 'needs-improvement', label: 'Needs work' },
]

export interface MealRecommendationActionsProps {
  context: MealRecommendationContext
  compact?: boolean
  primaryLabel?: string
  onComplete?: () => void
}

export function MealRecommendationActions({
  context,
  compact,
  primaryLabel = 'Cook Tonight',
  onComplete,
}: MealRecommendationActionsProps) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<'make' | 'rate' | 'list' | null>(null)
  const [phase, setPhase] = useState<Phase>('actions')
  const [missing, setMissing] = useState<string[]>([])
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [selectedRating, setSelectedRating] = useState(0)
  const [selectedTags, setSelectedTags] = useState<RecipeFeedbackTag[]>([])
  const [note, setNote] = useState('')
  const [personalName, setPersonalName] = useState('')
  const [kitchenMsg, setKitchenMsg] = useState<string | null>(null)

  async function handleLetsMakeIt() {
    setBusy('make')
    setStatusMsg(null)
    try {
      const result = await letsMakeIt(context)
      setMissing(result.missingIngredients)
      const parts: string[] = []
      if (result.mealPlanned) parts.push("Added to tonight's plan")
      if (result.missingIngredients.length === 0) {
        parts.push('All ingredients on hand')
      } else {
        parts.push(
          `${result.missingIngredients.length} item${result.missingIngredients.length !== 1 ? 's' : ''} missing`,
        )
      }
      setStatusMsg(parts.join(' · '))
      if (window.location.pathname.startsWith('/kitchen')) {
        onComplete?.()
      } else {
        navigate(result.navigateTo)
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Could not plan meal — try again')
    } finally {
      setBusy(null)
    }
  }

  async function handleAddMissing() {
    if (missing.length === 0) return
    setBusy('list')
    try {
      const added = await addMissingToShoppingList(missing)
      setStatusMsg(
        added.length > 0
          ? `Added ${added.join(', ')} to shopping list`
          : 'Items already on your list',
      )
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Could not add to list')
    } finally {
      setBusy(null)
    }
  }

  function handleMadeIt() {
    setPhase('confirm')
    setStatusMsg(null)
  }

  async function confirmCooked(yes: boolean) {
    if (!yes) {
      setPhase('actions')
      setStatusMsg('No problem — another night')
      return
    }
    setBusy('rate')
    try {
      const result = await finalizeMealCooked({
        recipeId: context.recipeId,
        recipeName: context.recipeName,
        ingredientsUsed: context.ingredientsUsed,
      })
      if (result.kitchenAdjusted > 0) {
        setKitchenMsg(
          `Updated kitchen for ${result.kitchenAdjusted} item${result.kitchenAdjusted !== 1 ? 's' : ''} (estimate)`,
        )
      } else {
        setKitchenMsg(null)
      }
      setPhase('learning')
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Could not log meal')
      setPhase('actions')
    } finally {
      setBusy(null)
    }
  }

  function toggleTag(tag: RecipeFeedbackTag) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    )
  }

  async function finishLearning(rating: number, withName?: string) {
    setSelectedRating(rating)
    setBusy('rate')
    try {
      const added = selectedTags.includes('added-ingredients') ? ['(custom)'] : undefined
      const removed = selectedTags.includes('removed-ingredients') ? ['(custom)'] : undefined
      await saveMealRating({
        recipeId: context.recipeId,
        recipeName: context.recipeName,
        rating,
        ingredientsUsed: context.ingredientsUsed,
        source: context.source,
        note: note.trim() || undefined,
        tags: selectedTags,
        personalName: withName?.trim() || personalName.trim() || undefined,
        addedIngredients: added,
        removedIngredients: removed,
      })
      const label = withName?.trim() || personalName.trim() || context.recipeName
      setPhase('done')
      setStatusMsg(
        kitchenMsg
          ? `Saved ${label} · ${kitchenMsg}`
          : `Haven will remember how ${label} went`,
      )
      onComplete?.()
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(null)
    }
  }

  function handleRatingPick(rating: number) {
    setSelectedRating(rating)
    if (rating >= 4) {
      setPhase('name')
      return
    }
    void finishLearning(rating)
  }

  function handleSkipLearning() {
    if (selectedRating > 0) {
      void finishLearning(selectedRating)
      return
    }
    setPhase('done')
    setStatusMsg(
      kitchenMsg
        ? `Marked cooked · ${kitchenMsg}`
        : `Marked ${context.recipeName} as cooked`,
    )
    onComplete?.()
  }

  function handleSaveName() {
    void finishLearning(selectedRating || 4, personalName)
  }

  function handleSkipName() {
    void finishLearning(selectedRating || 4)
  }

  if (phase === 'done') {
    return (
      <div className={`${styles.mealActions} ${compact ? styles.compact : ''}`}>
        <p className={styles.doneMsg}>{statusMsg ?? 'Meal logged!'}</p>
      </div>
    )
  }

  if (phase === 'confirm') {
    return (
      <div className={`${styles.mealActions} ${compact ? styles.compact : ''}`}>
        <div className={styles.ratingPanel}>
          <p className={styles.ratingTitle}>Did you make this?</p>
          <p className={styles.learnHint}>Haven will gently update your kitchen.</p>
          <div className={styles.btnRow}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => void confirmCooked(true)}
              disabled={busy !== null}
            >
              {busy === 'rate' ? 'Saving…' : 'Yes, I cooked it'}
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => void confirmCooked(false)}
              disabled={busy !== null}
            >
              Not tonight
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'name') {
    return (
      <div className={`${styles.mealActions} ${compact ? styles.compact : ''}`}>
        <div className={styles.ratingPanel}>
          <p className={styles.ratingTitle}>Name your version?</p>
          <p className={styles.learnHint}>Optional — e.g. Lisa&apos;s weeknight Alfredo</p>
          <input
            className={styles.nameInput}
            type="text"
            value={personalName}
            onChange={e => setPersonalName(e.target.value)}
            placeholder={`${context.recipeName} — your way`}
            maxLength={80}
            aria-label="Personal recipe name"
          />
          <div className={styles.btnRow}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={handleSaveName}
              disabled={busy === 'rate'}
            >
              {busy === 'rate' ? 'Saving…' : 'Save to Recipe Log'}
            </button>
            <button type="button" className={styles.skipBtn} onClick={handleSkipName}>
              Skip
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'learning') {
    return (
      <div className={`${styles.mealActions} ${compact ? styles.compact : ''}`}>
        <div className={styles.ratingPanel}>
          <p className={styles.ratingTitle}>How did it go?</p>
          {kitchenMsg && <p className={styles.kitchenMsg}>{kitchenMsg}</p>}
          <div className={styles.chipRow} role="group" aria-label="What changed">
            {CHANGE_CHIPS.map(chip => (
              <button
                key={chip.id}
                type="button"
                className={`${styles.chip} ${selectedTags.includes(chip.id) ? styles.chipActive : ''}`}
                onClick={() => toggleTag(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <textarea
            className={styles.noteInput}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Anything Haven should remember next time?"
            rows={2}
            maxLength={280}
            aria-label="Cook notes"
          />
          <p className={styles.ratingSubtitle}>How was it?</p>
          <div className={styles.stars} role="group" aria-label="Rate this meal">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                type="button"
                className={`${styles.star} ${star <= selectedRating ? styles.starActive : ''}`}
                onClick={() => handleRatingPick(star)}
                disabled={busy === 'rate'}
                aria-label={`${star} star${star !== 1 ? 's' : ''}`}
              >
                ★
              </button>
            ))}
          </div>
          <button type="button" className={styles.skipBtn} onClick={handleSkipLearning}>
            Skip
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`${styles.mealActions} ${compact ? styles.compact : ''}`}>
      <div className={styles.btnRow}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={handleLetsMakeIt}
          disabled={busy !== null}
        >
          {busy === 'make' ? 'Planning…' : primaryLabel}
        </button>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={handleMadeIt}
          disabled={busy !== null}
        >
          Made it
        </button>
      </div>

      {statusMsg && <p className={styles.statusMsg}>{statusMsg}</p>}

      {missing.length > 0 && (
        <div className={styles.missingPanel}>
          <p className={styles.missingTitle}>Pantry check — still need:</p>
          <ul className={styles.missingList}>
            {missing.slice(0, 5).map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <button
            type="button"
            className={styles.addListBtn}
            onClick={handleAddMissing}
            disabled={busy === 'list'}
          >
            {busy === 'list' ? 'Adding…' : 'Add missing to shopping list'}
          </button>
        </div>
      )}
    </div>
  )
}

export function isMealRecommendation(
  moduleOrCategory?: string,
  payload?: Record<string, unknown>,
): boolean {
  if (moduleOrCategory === 'pantry' || moduleOrCategory === 'meals') return true
  if (payload?.recipeName || payload?.recipeId) return true
  return false
}
