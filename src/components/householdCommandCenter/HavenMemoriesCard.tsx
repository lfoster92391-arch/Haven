import { useEffect, useState } from 'react'
import {
  emptyHavenMemoryLine,
  gatherHavenMemories,
  pickFeaturedMemory,
  type HavenMemory,
} from '../../lib/havenMemories'
import styles from './HavenMemoriesCard.module.css'

/**
 * Haven Memories — personal attachment, not social sharing.
 */
export function HavenMemoriesCard() {
  const [memory, setMemory] = useState<HavenMemory | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void gatherHavenMemories().then(list => {
      if (cancelled) return
      setMemory(pickFeaturedMemory(list) ?? emptyHavenMemoryLine())
      setReady(true)
    })
    const onUpdate = () => {
      void gatherHavenMemories().then(list => {
        if (!cancelled) setMemory(pickFeaturedMemory(list) ?? emptyHavenMemoryLine())
      })
    }
    window.addEventListener('haven:recipe-log-updated', onUpdate)
    window.addEventListener('haven:founders-impact-updated', onUpdate)
    return () => {
      cancelled = true
      window.removeEventListener('haven:recipe-log-updated', onUpdate)
      window.removeEventListener('haven:founders-impact-updated', onUpdate)
    }
  }, [])

  if (!ready || !memory) return null

  return (
    <section className={styles.card} aria-label="Haven Memories">
      <p className={styles.eyebrow}>Haven Memories</p>
      <p className={styles.line}>{memory.line}</p>
      {memory.whisper && <p className={styles.whisper}>{memory.whisper}</p>}
      <p className={styles.privacy}>Just for you — never a feed, never shared.</p>
    </section>
  )
}
