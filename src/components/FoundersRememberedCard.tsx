import { useEffect, useId, useState } from 'react'
import {
  getPendingFoundersThanks,
  markFoundersThanksSeen,
  type FoundersRememberedThanks,
} from '../lib/beta/foundingMemberImpact'
import { shouldShowFoundersWelcome } from '../lib/beta/foundersWelcome'
import styles from './FoundersRememberedCard.module.css'

/**
 * Personalized thank-you when a shipped slice matches a Founder’s earlier note.
 * Closing emotion: being remembered.
 */
export function FoundersRememberedCard() {
  const titleId = useId()
  const [thanks, setThanks] = useState<FoundersRememberedThanks | null>(null)

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        const welcomeOpen = await shouldShowFoundersWelcome()
        if (welcomeOpen || cancelled) return
        const pending = await getPendingFoundersThanks()
        if (!cancelled && pending) setThanks(pending)
      })()
    }, 2800)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  async function dismiss() {
    if (!thanks) return
    await markFoundersThanksSeen(thanks.featureId)
    setThanks(null)
  }

  if (!thanks) return null

  return (
    <div className={styles.backdrop} role="presentation" onClick={() => void dismiss()}>
      <div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
      >
        <p className={styles.eyebrow}>🌿 Because of you</p>
        <h2 id={titleId} className={styles.title}>
          {thanks.title} is here
        </h2>
        <p className={styles.body}>{thanks.thankYou}</p>
        <p className={styles.closing}>Thank you for helping make Haven better.</p>
        <button type="button" className={styles.cta} onClick={() => void dismiss()}>
          That means a lot
        </button>
      </div>
    </div>
  )
}
