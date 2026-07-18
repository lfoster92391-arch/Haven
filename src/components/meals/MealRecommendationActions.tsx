import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { RecipeFeedbackTag } from '../../db/database'
import {
  addMissingToShoppingList,
  finalizeMealCooked,
  letsMakeIt,
  recipeLearningKey,
  saveMealRating,
  type MealRecommendationContext,
} from '../../lib/mealRecommendationActions'
import { getLearningProfile } from '../../lib/mealLearning'
import {
  formatYourVersionHint,
  resolveEvolutionPrompt,
  type PendingEvolution,
} from '../../lib/recipeEvolution'
import styles from './MealRecommendationActions.module.css'

type Phase = 'actions' | 'confirm' | 'learning' | 'name' | 'evolution' | 'done'

const CHANGE_CHIPS: { id: RecipeFeedbackTag; label: string }[] = [
  { id: 'added-ingredients', label: 'Added something' },
  { id: 'removed-ingredients', label: 'Skipped something' },
  { id: 'changed-amounts', label: 'Changed amounts' },
  { id: 'turned-out-great', label: 'Turned out great' },
  { id: 'needs-improvement', label: 'Needs work' },
]

function parseIngredientList(raw: string): string[] {
  return raw
    .split(/,|&|\band\b/i)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 6)
}

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
  const [busy, setBusy] = useState<'make' | 'rate' | 'list' | 'evolve' | null>(null)
  const [phase, setPhase] = useState<Phase>('actions')
  const [missing, setMissing] = useState<string[]>([])
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [selectedRating, setSelectedRating] = useState(0)
  const [selectedTags, setSelectedTags] = useState<RecipeFeedbackTag[]>([])
  const [note, setNote] = useState('')
  const [personalName, setPersonalName] = useState('')
  const [addedText, setAddedText] = useState('')
  const [removedText, setRemovedText] = useState('')
  const [kitchenMsg, setKitchenMsg] = useState<string | null>(null)
  const [versionHint, setVersionHint] = useState<string | null>(null)
  const [pendingEvolution, setPendingEvolution] = useState<PendingEvolution | null>(null)
  const [doneLabel, setDoneLabel] = useState(context.recipeName)

  useEffect(() => {
    let cancelled = false
    const key = recipeLearningKey(context.recipeId, context.recipeName)
    void getLearningProfile(key).then(profile => {
      if (cancelled) return
      setVersionHint(formatYourVersionHint(profile))
      if (profile?.personalName) setPersonalName(profile.personalName)
    })
    return () => {
      cancelled = true
    }
  }, [context.recipeId, context.recipeName])

  async function handleLetsMakeIt() {
    setBusy('make')
    setStatusMsg(null)
    try {
      const result = await letsMakeIt(context)
      setMissing(result.missingIngredients)
      const parts: string[] = []
      if (result.mealPlanned) parts.push("I'll keep this for tonight")
      if (result.missingIngredients.length === 0) {
        parts.push('Looks like you have what you need')
      } else {
        parts.push(
          `${result.missingIngredients.length} thing${result.missingIngredients.length !== 1 ? 's' : ''} still to gather`,
        )
      }
      setStatusMsg(parts.join(' · '))
      if (window.location.pathname.startsWith('/kitchen')) {
        onComplete?.()
      } else {
        navigate(result.navigateTo)
      }
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Something didn't go quite as planned")
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
          ? `I'll remember ${added.join(', ')} for your list`
          : 'Those are already on your list',
      )
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Couldn't update your list")
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
          result.kitchenAdjusted === 1
            ? "I've gently updated your kitchen for one ingredient (estimate)."
            : `I've gently updated your kitchen for ${result.kitchenAdjusted} ingredients (estimate).`,
        )
      } else {
        setKitchenMsg(null)
      }
      setPhase('learning')
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Couldn't log that meal")
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
      const added = selectedTags.includes('added-ingredients')
        ? parseIngredientList(addedText).length > 0
          ? parseIngredientList(addedText)
          : ['(custom)']
        : undefined
      const removed = selectedTags.includes('removed-ingredients')
        ? parseIngredientList(removedText).length > 0
          ? parseIngredientList(removedText)
          : ['(custom)']
        : undefined
      const { pendingEvolution: pending } = await saveMealRating({
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
      setDoneLabel(label)
      if (pending) {
        setPendingEvolution(pending)
        setPhase('evolution')
        return
      }
      setPhase('done')
      setStatusMsg(
        kitchenMsg
          ? `I'll remember how ${label} went. ${kitchenMsg}`
          : `I'll remember how ${label} went.`,
      )
      onComplete?.()
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : "Couldn't save that")
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
        ? `Marked cooked. ${kitchenMsg}`
        : `I'll remember you cooked ${context.recipeName}.`,
    )
    onComplete?.()
  }

  function handleSaveName() {
    void finishLearning(selectedRating || 4, personalName)
  }

  function handleSkipName() {
    void finishLearning(selectedRating || 4)
  }

  async function handleEvolution(decision: 'accepted' | 'keep-asking' | 'declined') {
    if (!pendingEvolution) return
    setBusy('evolve')
    try {
      await resolveEvolutionPrompt({
        recipeKey: pendingEvolution.recipeKey,
        ingredient: pendingEvolution.ingredient,
        kind: pendingEvolution.kind,
        decision,
      })
      setPhase('done')
      if (decision === 'accepted') {
        setStatusMsg(
          pendingEvolution.kind === 'add'
            ? `I'll remember — ${doneLabel} usually includes ${pendingEvolution.ingredient}.`
            : `I'll remember — ${doneLabel} usually skips ${pendingEvolution.ingredient}.`,
        )
      } else if (decision === 'keep-asking') {
        setStatusMsg("Okay — I'll check in again next time.")
      } else {
        setStatusMsg("Got it — I won't keep asking about that.")
      }
      onComplete?.()
    } catch {
      setPhase('done')
      setStatusMsg(`I'll remember how ${doneLabel} went.`)
      onComplete?.()
    } finally {
      setBusy(null)
    }
  }

  if (phase === 'done') {
    return (
      <div className={`${styles.mealActions} ${compact ? styles.compact : ''}`}>
        <p className={styles.doneMsg}>{statusMsg ?? "I'll remember that."}</p>
      </div>
    )
  }

  if (phase === 'evolution' && pendingEvolution) {
    return (
      <div className={`${styles.mealActions} ${compact ? styles.compact : ''}`}>
        <div className={styles.ratingPanel}>
          <p className={styles.ratingTitle}>Your version is taking shape</p>
          <p className={styles.learnHint}>{pendingEvolution.message}</p>
          <div className={styles.btnRow}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => void handleEvolution('accepted')}
              disabled={busy !== null}
            >
              {busy === 'evolve' ? 'Saving…' : 'Yes, remember it'}
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => void handleEvolution('keep-asking')}
              disabled={busy !== null}
            >
              Keep asking
            </button>
            <button
              type="button"
              className={styles.skipBtn}
              onClick={() => void handleEvolution('declined')}
              disabled={busy !== null}
            >
              Not for now
            </button>
          </div>
        </div>
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
          {selectedTags.includes('added-ingredients') && (
            <input
              className={styles.nameInput}
              type="text"
              value={addedText}
              onChange={e => setAddedText(e.target.value)}
              placeholder="What did you add? (e.g. mushrooms)"
              maxLength={120}
              aria-label="Ingredients you added"
            />
          )}
          {selectedTags.includes('removed-ingredients') && (
            <input
              className={styles.nameInput}
              type="text"
              value={removedText}
              onChange={e => setRemovedText(e.target.value)}
              placeholder="What did you skip?"
              maxLength={120}
              aria-label="Ingredients you skipped"
            />
          )}
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
      {versionHint && <p className={styles.versionHint}>{versionHint}</p>}
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
          <p className={styles.missingTitle}>Still to gather:</p>
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
