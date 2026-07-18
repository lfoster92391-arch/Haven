import { useEffect, useState, type MouseEvent } from 'react'
import { format, parseISO } from 'date-fns'
import {
  displayRecipeName,
  getRecipeLogDetail,
  getRecipeLogEntries,
  toggleFavorite,
  type MealLearningProfile,
} from '../../lib/mealLearning'
import {
  formatYourVersionHint,
  resolveEvolutionPrompt,
  type PendingEvolution,
} from '../../lib/recipeEvolution'
import styles from './RecipeLog.module.css'

interface DetailState {
  avgRating: number | null
  ratingCount: number
  pendingEvolution: PendingEvolution | null
}

export function RecipeLog() {
  const [entries, setEntries] = useState<MealLearningProfile[]>([])
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailState | null>(null)
  const [evolveBusy, setEvolveBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void getRecipeLogEntries(12).then(list => {
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

  useEffect(() => {
    if (!openKey) {
      setDetail(null)
      return
    }
    let cancelled = false
    void getRecipeLogDetail(openKey).then(result => {
      if (cancelled || !result) return
      setDetail({
        avgRating: result.avgRating,
        ratingCount: result.ratingCount,
        pendingEvolution: result.pendingEvolution,
      })
      // refresh list entry in place
      setEntries(prev => prev.map(e => (e.recipeKey === openKey ? result.entry : e)))
    })
    return () => {
      cancelled = true
    }
  }, [openKey])

  if (entries.length === 0) return null

  async function handleFavorite(entry: MealLearningProfile, e: MouseEvent) {
    e.stopPropagation()
    const next = !entry.isFavorite
    await toggleFavorite(entry.recipeKey, entry.recipeName, next)
    setEntries(prev =>
      prev.map(item =>
        item.recipeKey === entry.recipeKey ? { ...item, isFavorite: next } : item,
      ),
    )
  }

  async function handleEvolution(
    entry: MealLearningProfile,
    pending: PendingEvolution,
    decision: 'accepted' | 'keep-asking' | 'declined',
  ) {
    setEvolveBusy(true)
    try {
      await resolveEvolutionPrompt({
        recipeKey: entry.recipeKey,
        ingredient: pending.ingredient,
        kind: pending.kind,
        decision,
      })
      const refreshed = await getRecipeLogDetail(entry.recipeKey)
      if (refreshed) {
        setEntries(prev =>
          prev.map(item => (item.recipeKey === entry.recipeKey ? refreshed.entry : item)),
        )
        setDetail({
          avgRating: refreshed.avgRating,
          ratingCount: refreshed.ratingCount,
          pendingEvolution: refreshed.pendingEvolution,
        })
      }
    } finally {
      setEvolveBusy(false)
    }
  }

  return (
    <section className={styles.section} aria-label="Recipe Log">
      <h3 className={styles.title}>Recipe Log</h3>
      <p className={styles.sub}>Your versions — what Haven remembers from nights you cooked.</p>
      <ul className={styles.list}>
        {entries.map(entry => {
          const open = openKey === entry.recipeKey
          const versionHint = formatYourVersionHint(entry)
          return (
            <li key={entry.recipeKey} className={`${styles.item} ${open ? styles.itemOpen : ''}`}>
              <button
                type="button"
                className={styles.itemBtn}
                onClick={() => setOpenKey(open ? null : entry.recipeKey)}
                aria-expanded={open}
              >
                <div className={styles.row}>
                  <span className={styles.name}>
                    {entry.isFavorite ? '♥ ' : ''}
                    {displayRecipeName(entry)}
                  </span>
                  <span className={styles.meta}>
                    {entry.cookCount > 0 && (
                      <>
                        Cooked {entry.cookCount}×
                        {entry.lastCookedAt
                          ? ` · ${format(parseISO(entry.lastCookedAt), 'MMM d')}`
                          : ''}
                      </>
                    )}
                  </span>
                </div>
                {entry.personalName && entry.personalName !== entry.recipeName && (
                  <p className={styles.from}>From {entry.recipeName}</p>
                )}
                {versionHint && <p className={styles.version}>{versionHint}</p>}
                {!open && entry.lastCookNote && (
                  <p className={styles.note}>{entry.lastCookNote}</p>
                )}
              </button>

              {open && (
                <div className={styles.detail}>
                  <div className={styles.detailMeta}>
                    {detail?.avgRating != null && (
                      <span className={styles.badge}>
                        ★ {detail.avgRating}
                        {detail.ratingCount > 1 ? ` · ${detail.ratingCount} nights` : ''}
                      </span>
                    )}
                    {entry.isFavorite && <span className={styles.badge}>Family favorite</span>}
                    {(entry.defaultAdditions?.length || entry.defaultRemovals?.length) && (
                      <span className={styles.badge}>Your version</span>
                    )}
                  </div>

                  {entry.lastCookNote && (
                    <p className={styles.detailNote}>
                      <span className={styles.detailLabel}>Last note</span>
                      {entry.lastCookNote}
                    </p>
                  )}

                  {entry.defaultAdditions && entry.defaultAdditions.length > 0 && (
                    <p className={styles.detailNote}>
                      <span className={styles.detailLabel}>Usually adds</span>
                      {entry.defaultAdditions.join(', ')}
                    </p>
                  )}

                  {entry.defaultRemovals && entry.defaultRemovals.length > 0 && (
                    <p className={styles.detailNote}>
                      <span className={styles.detailLabel}>Usually skips</span>
                      {entry.defaultRemovals.join(', ')}
                    </p>
                  )}

                  {detail?.pendingEvolution && (
                    <div className={styles.evolve}>
                      <p className={styles.evolveMsg}>{detail.pendingEvolution.message}</p>
                      <div className={styles.evolveActions}>
                        <button
                          type="button"
                          className={styles.evolvePrimary}
                          disabled={evolveBusy}
                          onClick={() =>
                            void handleEvolution(entry, detail.pendingEvolution!, 'accepted')
                          }
                        >
                          Yes, remember it
                        </button>
                        <button
                          type="button"
                          className={styles.evolveSecondary}
                          disabled={evolveBusy}
                          onClick={() =>
                            void handleEvolution(entry, detail.pendingEvolution!, 'keep-asking')
                          }
                        >
                          Keep asking
                        </button>
                        <button
                          type="button"
                          className={styles.evolveGhost}
                          disabled={evolveBusy}
                          onClick={() =>
                            void handleEvolution(entry, detail.pendingEvolution!, 'declined')
                          }
                        >
                          Not for now
                        </button>
                      </div>
                    </div>
                  )}

                  <div className={styles.detailActions}>
                    <button
                      type="button"
                      className={styles.favBtn}
                      onClick={e => void handleFavorite(entry, e)}
                    >
                      {entry.isFavorite ? '♥ Favorited' : '♡ Mark favorite'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
