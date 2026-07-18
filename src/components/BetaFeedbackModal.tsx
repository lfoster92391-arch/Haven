import { useEffect, useId, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from './Button'
import {
  dismissFeedbackPrompt,
  markFeedbackShown,
  shouldShowFeedbackPrompt,
  submitBetaFeedback,
} from '../lib/beta/feedback'
import type { HelpHavenIntent } from '../db/database'
import { useTellHavenVoice } from '../hooks/useTellHavenVoice'
import styles from './BetaFeedbackModal.module.css'

interface BetaFeedbackModalProps {
  justSignedIn?: boolean
  openNonce?: number
}

const INTENT_CHIPS: { id: HelpHavenIntent; emoji: string; label: string }[] = [
  { id: 'love', emoji: '❤️', label: 'I love this' },
  { id: 'idea', emoji: '💡', label: 'I have an idea' },
  { id: 'bug', emoji: '🐞', label: "Something isn't working" },
  { id: 'confused', emoji: '🤔', label: 'This confused me' },
  { id: 'wish', emoji: '✨', label: 'I wish Haven could…' },
  { id: 'voice', emoji: '🎤', label: 'Tell Haven' },
]

const NOTE_PROMPTS: Record<HelpHavenIntent, string> = {
  love: 'What felt good?',
  idea: 'Tell Haven your idea…',
  bug: 'What went sideways?',
  confused: 'What felt unclear?',
  wish: 'I wish Haven could…',
  voice: 'Speak, or type what you’d like Haven to know…',
}

export function BetaFeedbackModal({ justSignedIn, openNonce = 0 }: BetaFeedbackModalProps) {
  const titleId = useId()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<'form' | 'thanks'>('form')
  const [rating, setRating] = useState(0)
  const [intent, setIntent] = useState<HelpHavenIntent | null>(null)
  const [note, setNote] = useState('')
  const [fromVoice, setFromVoice] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const voice = useTellHavenVoice((text, isFinal) => {
    setNote(prev => {
      if (!isFinal) return text
      const base = prev.trim()
      return base && !base.endsWith(text) ? `${base} ${text}`.trim() : text
    })
    if (isFinal) setFromVoice(true)
  })

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        const { show } = await shouldShowFeedbackPrompt({ justSignedIn })
        if (cancelled || !show) return
        await markFeedbackShown()
        if (!cancelled) {
          setPhase('form')
          setOpen(true)
        }
      })()
    }, justSignedIn ? 1800 : 4500)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [justSignedIn])

  useEffect(() => {
    if (openNonce < 1) return
    setPhase('form')
    setError(null)
    setRating(0)
    setIntent(null)
    setNote('')
    setFromVoice(false)
    setOpen(true)
  }, [openNonce])

  const { stop: stopVoice } = voice
  useEffect(() => {
    if (!open) stopVoice()
  }, [open, stopVoice])

  async function onDismiss() {
    voice.stop()
    await dismissFeedbackPrompt()
    setOpen(false)
  }

  function pickIntent(next: HelpHavenIntent) {
    setIntent(next)
    setError(null)
    if (next === 'voice') {
      voice.start()
    } else {
      voice.stop()
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    voice.stop()
    if (rating < 1 || rating > 5) {
      setError('How did this page make you feel? Tap a star.')
      return
    }
    if (!intent) {
      setError('What would you like to tell Haven?')
      return
    }
    setBusy(true)
    try {
      await submitBetaFeedback({
        rating,
        intent,
        note,
        fromVoice: fromVoice || intent === 'voice',
        pagePath: location.pathname,
      })
      setPhase('thanks')
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something didn’t go quite as planned. Let’s try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className={styles.backdrop} role="presentation" onClick={() => void onDismiss()}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
      >
        {phase === 'form' ? (
          <>
            <h2 id={titleId} className={styles.title}>
              🌿 Help Haven Learn
            </h2>
            <p className={styles.subtitle}>
              You’re helping teach Haven how to care for homes — not testing software.
            </p>

            <form className={styles.form} onSubmit={e => void onSubmit(e)}>
              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>How did this page make you feel?</legend>
                <div className={styles.stars} role="group" aria-label="Feeling 1 to 5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      className={n <= rating ? styles.starActive : styles.star}
                      aria-label={`${n} star${n === 1 ? '' : 's'}`}
                      aria-pressed={n === rating}
                      onClick={() => setRating(n)}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>What would you like to tell me?</legend>
                <div className={styles.chipRow}>
                  {INTENT_CHIPS.map(chip => (
                    <button
                      key={chip.id}
                      type="button"
                      className={intent === chip.id ? styles.chipActive : styles.chip}
                      aria-pressed={intent === chip.id}
                      onClick={() => pickIntent(chip.id)}
                    >
                      <span aria-hidden>{chip.emoji}</span> {chip.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {intent && (
                <>
                  <label className={styles.label} htmlFor="haven-learn-note">
                    {NOTE_PROMPTS[intent]}{' '}
                    <span className={styles.opt}>(optional)</span>
                  </label>
                  <textarea
                    id="haven-learn-note"
                    className={styles.textarea}
                    rows={3}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    maxLength={600}
                    placeholder={
                      intent === 'voice'
                        ? voice.listening
                          ? 'Listening…'
                          : 'Tap the mic again, or type here'
                        : undefined
                    }
                  />
                  {intent === 'voice' && (
                    <div className={styles.voiceRow}>
                      {voice.supported ? (
                        <button
                          type="button"
                          className={`${styles.voiceBtn} ${voice.listening ? styles.voiceListening : ''}`}
                          onClick={() => (voice.listening ? voice.stop() : voice.start())}
                        >
                          {voice.listening ? '⏹ Stop listening' : '🎤 Tell Haven'}
                        </button>
                      ) : (
                        <p className={styles.privacy}>
                          Voice isn’t available here — typing works just as well.
                        </p>
                      )}
                    </div>
                  )}
                  {(voice.error) && (
                    <p className={styles.error} role="alert">
                      {voice.error}
                    </p>
                  )}
                </>
              )}

              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}

              <div className={styles.actions}>
                <Button type="button" variant="ghost" onClick={() => void onDismiss()} disabled={busy}>
                  Not now
                </Button>
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy ? 'Sharing…' : 'Help Haven Learn'}
                </Button>
              </div>
              <p className={styles.privacy}>
                Optional — never blocks Haven. Your notes help Haven grow.
              </p>
            </form>
          </>
        ) : (
          <div className={styles.thanks}>
            <h2 id={titleId} className={styles.title}>
              🌿 Thank you
            </h2>
            <p className={styles.subtitle}>
              You just helped Haven become a little smarter.
              <br />
              I’ll remember this as we grow together.
            </p>
            <p className={styles.heart} aria-hidden>
              ❤️
            </p>
            <Button type="button" variant="primary" onClick={() => setOpen(false)}>
              Back to Haven
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
