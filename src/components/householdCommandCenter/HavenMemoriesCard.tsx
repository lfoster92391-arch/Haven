import { useEffect, useState } from 'react'
import {
  emptyHavenMemoryLine,
  gatherHavenMemories,
  pickFeaturedMemory,
  topMemoriesForDay,
  type HavenMemory,
} from '../../lib/havenMemories'
import styles from './HavenMemoriesCard.module.css'

/**
 * Haven Memories — personal attachment, not social sharing.
 */
export function HavenMemoriesCard() {
  const [pool, setPool] = useState<HavenMemory[]>([])
  const [offset, setOffset] = useState(0)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void gatherHavenMemories().then(list => {
        if (cancelled) return
        setPool(topMemoriesForDay(list))
        setReady(true)
      })
    }
    load()
    const onUpdate = () => load()
    window.addEventListener('haven:recipe-log-updated', onUpdate)
    window.addEventListener('haven:founders-impact-updated', onUpdate)
    window.addEventListener('haven:bathroom-learned', onUpdate)
    return () => {
      cancelled = true
      window.removeEventListener('haven:recipe-log-updated', onUpdate)
      window.removeEventListener('haven:founders-impact-updated', onUpdate)
      window.removeEventListener('haven:bathroom-learned', onUpdate)
    }
  }, [])

  if (!ready) return null

  const memory =
    pickFeaturedMemory(pool, new Date(), offset) ?? emptyHavenMemoryLine()
  const canRotate = pool.length > 1

  return (
    <section className={styles.card} aria-label="Haven Memories">
      <p className={styles.eyebrow}>Haven Memories</p>
      <p className={styles.line} key={memory.id}>
        {memory.line}
      </p>
      {memory.whisper && <p className={styles.whisper}>{memory.whisper}</p>}
      <div className={styles.footer}>
        <p className={styles.privacy}>Just for you — never a feed, never shared.</p>
        {canRotate && (
          <button
            type="button"
            className={styles.another}
            onClick={() => setOffset(o => o + 1)}
          >
            Another memory
          </button>
        )}
      </div>
    </section>
  )
}
