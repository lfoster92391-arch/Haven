import { useEffect, useState } from 'react'
import {
  BATHROOM_CATALOG,
  getBathroomCareStatuses,
  learnBathroomItems,
  listBathroomReplaceables,
  markBathroomReplaced,
  type BathroomCareStatus,
} from '../../lib/bathroomLifecycle'
import type { BathroomReplaceableKind } from '../../db/database'
import styles from './LearnBathroomCard.module.css'

/**
 * “Let’s learn your bathroom” — household assistant replaceables,
 * not a grocery / inventory list.
 */
export function LearnBathroomCard() {
  const [known, setKnown] = useState(0)
  const [selected, setSelected] = useState<Set<BathroomReplaceableKind>>(new Set())
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [care, setCare] = useState<BathroomCareStatus[]>([])
  const [savedNote, setSavedNote] = useState<string | null>(null)

  async function refresh() {
    const [items, statuses] = await Promise.all([
      listBathroomReplaceables(),
      getBathroomCareStatuses(),
    ])
    setKnown(items.length)
    setCare(statuses)
    if (items.length > 0) {
      setSelected(new Set(items.map(i => i.kind)))
    }
  }

  useEffect(() => {
    let cancelled = false
    void refresh().then(() => {
      if (!cancelled) {
        /* ready */
      }
    })
    const onUpdate = () => void refresh()
    window.addEventListener('haven:bathroom-learned', onUpdate)
    return () => {
      cancelled = true
      window.removeEventListener('haven:bathroom-learned', onUpdate)
    }
  }, [])

  function toggle(kind: BathroomReplaceableKind) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  async function save() {
    if (selected.size === 0) return
    setSaving(true)
    try {
      await learnBathroomItems([...selected])
      setSavedNote('I’ll remember these with you — quietly.')
      setOpen(false)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const due = care.filter(c => c.tone === 'ready' || c.tone === 'soon')

  return (
    <section className={styles.card} aria-label="Learn your bathroom">
      <p className={styles.eyebrow}>Home care</p>
      <h3 className={styles.title}>
        {known > 0 ? 'Your bathroom, remembered' : 'Let’s learn your bathroom'}
      </h3>
      <p className={styles.copy}>
        {known > 0
          ? 'Toothbrushes, loofahs, and the little things that wear out — I’ve got them so you don’t have to.'
          : 'Toothbrushes, loofahs, shower poufs, washcloths… people forget until they become a problem. Tell me what’s yours, and I’ll notice before that.'}
      </p>

      {savedNote && <p className={styles.saved}>{savedNote}</p>}

      {due.length > 0 && (
        <ul className={styles.dueList}>
          {due.slice(0, 2).map(s => (
            <li key={s.item.id ?? s.item.kind} className={styles.dueItem}>
              <div>
                <p className={styles.dueLine}>{s.line}</p>
                {s.whisper && <p className={styles.dueWhisper}>{s.whisper}</p>}
              </div>
              {s.item.id != null && s.tone === 'ready' && (
                <button
                  type="button"
                  className={styles.refreshBtn}
                  onClick={() => void markBathroomReplaced(s.item.id!)}
                >
                  Fresh one in place
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <button type="button" className={styles.btn} onClick={() => setOpen(true)}>
          {known > 0 ? 'Update what I remember' : 'Show Haven my bathroom'}
        </button>
      ) : (
        <div className={styles.learn}>
          <p className={styles.learnHint}>Tap what lives in your bathroom right now.</p>
          <ul className={styles.chips}>
            {BATHROOM_CATALOG.map(item => {
              const on = selected.has(item.kind)
              return (
                <li key={item.kind}>
                  <button
                    type="button"
                    className={on ? styles.chipOn : styles.chip}
                    aria-pressed={on}
                    onClick={() => toggle(item.kind)}
                  >
                    {item.label}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btn}
              disabled={saving || selected.size === 0}
              onClick={() => void save()}
            >
              {saving ? 'Remembering…' : 'I’ll remember these'}
            </button>
            <button type="button" className={styles.ghost} onClick={() => setOpen(false)}>
              Not now
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
