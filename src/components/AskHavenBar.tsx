import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ASK_HAVEN_OPEN_EVENT,
  createChatSession,
  loadRecentChatMessages,
  openAskHaven,
  processChatTurn,
  runBabyCareAction,
  runChristmasAction,
  type AskHavenOpenDetail,
  type HavenChatSession,
} from '../lib/havenChat'
import { buildChristmasSecretPanel } from '../lib/havenChat/christmasSecret'
import { betaSafePath, isBetaFeatureOpen } from '../lib/betaFeatures'
import styles from './AskHavenBar.module.css'

export interface AskHavenChip {
  label: string
  query: string
}

export const ASK_HAVEN_CHIPS: AskHavenChip[] = [
  { label: "What's for dinner?", query: "What's for dinner?" },
  { label: 'Walk me through cooking', query: 'How do I cook dinner tonight?' },
  { label: 'Show Haven my kitchen', query: 'Show Haven my kitchen' },
  { label: 'Where can I save?', query: 'Where can I save this week?' },
  { label: "What's due?", query: "What's due this week?" },
  { label: 'Subscriptions to cut', query: 'Any unused subscriptions?' },
  { label: 'Buy / Wait / Skip', query: 'Should I buy, wait, or skip groceries?' },
  { label: "What's coming?", query: "What's coming up?" },
  { label: 'Food going bad?', query: "What's expiring soon?" },
  { label: 'I saved $50', query: 'I saved $50 this month' },
  { label: "I don't eat shrimp", query: "I don't eat shrimp" },
]

export { openAskHaven }

export function AskHavenBar() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [contextHint, setContextHint] = useState<string | undefined>()
  const [session, setSession] = useState<HavenChatSession>(() => createChatSession())
  const threadRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef(session)
  const navigate = useNavigate()
  const pendingQuery = useRef<string | null>(null)

  sessionRef.current = session

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<AskHavenOpenDetail>).detail ?? {}
      setContextHint(detail.hint)
      if (detail.hint) {
        const next = createChatSession(detail.hint)
        setSession(next)
        sessionRef.current = next
      }
      setOpen(true)
      if (detail.query) {
        pendingQuery.current = detail.query
      }
    }
    window.addEventListener(ASK_HAVEN_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(ASK_HAVEN_OPEN_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    void loadRecentChatMessages(30).then(history => {
      if (history.length === 0 || contextHint) return
      setSession(prev => {
        const next = {
          ...prev,
          messages: history,
        }
        sessionRef.current = next
        return next
      })
    })
  }, [open, contextHint])

  useEffect(() => {
    if (!open || busy) return
    const q = pendingQuery.current
    if (!q) return
    pendingQuery.current = null
    void send(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!threadRef.current) return
    threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [session.messages, open])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setInput('')
    try {
      const { session: next, navigateTo } = await processChatTurn(sessionRef.current, trimmed)
      sessionRef.current = next
      setSession(next)
      if (navigateTo) {
        const safe = betaSafePath(navigateTo)
        if (safe && isBetaFeatureOpen(safe) && !next.cookingGuide) {
          setOpen(false)
          navigate(safe)
        }
      }
    } finally {
      setBusy(false)
    }
  }

  function handleChip(chip: AskHavenChip) {
    void send(chip.query)
  }

  function goLink(route: string) {
    const safe = betaSafePath(route)
    if (!safe || !isBetaFeatureOpen(safe)) return
    setOpen(false)
    navigate(safe)
  }

  async function runSecretAction(
    panelId: string,
    actionId: string,
  ) {
    if (busy) return
    setBusy(true)
    try {
      let message = ''
      let navigateTo: string | undefined
      let secretPanel: ReturnType<typeof buildChristmasSecretPanel> | undefined

      if (panelId === 'baby_care') {
        const result = await runBabyCareAction(actionId)
        message = result.message
        navigateTo = result.navigateTo
      } else {
        const result = await runChristmasAction(actionId)
        message = result.message
        navigateTo = result.navigateTo
        if (result.giftList) {
          secretPanel = buildChristmasSecretPanel(result.giftList)
        }
      }

      const assistantMsg = {
        id: `${Date.now()}-secret-action`,
        role: 'assistant' as const,
        text: message,
        createdAt: new Date().toISOString(),
        route: navigateTo,
        links: navigateTo
          ? [{ label: 'Open →', route: navigateTo }]
          : undefined,
        secretPanel,
      }

      setSession(prev => {
        const next = {
          ...prev,
          messages: [...prev.messages, assistantMsg],
        }
        sessionRef.current = next
        return next
      })

      if (navigateTo) {
        const safe = betaSafePath(navigateTo)
        if (safe && isBetaFeatureOpen(safe)) {
          setOpen(false)
          navigate(safe)
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className={styles.barWrap}>
        <button
          type="button"
          className={styles.bar}
          onClick={() => {
            setContextHint(undefined)
            setOpen(true)
          }}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span className={styles.icon} aria-hidden>🌿</span>
          <span className={styles.placeholder}>
            Ask Haven… dinner, cook steps, bills, savings…
          </span>
        </button>
      </div>

      {open && (
        <div
          className={styles.overlay}
          role="dialog"
          aria-label="Ask Haven"
          onClick={() => setOpen(false)}
        >
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Ask Haven</h2>
              <button
                type="button"
                className={styles.close}
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className={styles.modalHint}>
              I’m here for dinner ideas, cook steps, bills, and quiet savings finds — local and private.
            </p>

            <div className={styles.thread} ref={threadRef} role="log" aria-live="polite">
              {session.messages.map(m => (
                <div
                  key={m.id}
                  className={m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant}
                >
                  <p className={styles.bubbleText}>{m.text}</p>

                  {m.cookStep && (
                    <div className={styles.cookStepCard}>
                      <div className={styles.cookStepMeta}>
                        {m.cookStep.recipeName} · Step {m.cookStep.stepIndex + 1} of {m.cookStep.totalSteps}
                      </div>
                      <p className={styles.cookStepText}>{m.cookStep.stepText}</p>
                      <div className={styles.cookStepActions}>
                        {m.cookStep.stepIndex + 1 < m.cookStep.totalSteps ? (
                          <button
                            type="button"
                            className={styles.cookNextBtn}
                            disabled={busy}
                            onClick={() => void send('next')}
                          >
                            Next step
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.cookNextBtn}
                            disabled={busy}
                            onClick={() => void send('done')}
                          >
                            Done — mark Made it
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {m.secretPanel && (
                    <div className={styles.secretPanel}>
                      <div className={styles.secretPanelTitle}>{m.secretPanel.title}</div>
                      {'daysUntilChristmas' in m.secretPanel && (
                        <p className={styles.secretMeta}>
                          {m.secretPanel.daysUntilChristmas === 0
                            ? 'Christmas is today'
                            : `${m.secretPanel.daysUntilChristmas} days until Christmas · ${m.secretPanel.christmasDateLabel}`}
                        </p>
                      )}

                      {m.secretPanel.sections.map(section => (
                        <div key={section.id} className={styles.secretSection}>
                          <h3 className={styles.secretSectionTitle}>{section.title}</h3>
                          {section.tips && section.tips.length > 0 && (
                            <ul className={styles.secretTips}>
                              {section.tips.map(tip => (
                                <li key={tip.slice(0, 48)}>{tip}</li>
                              ))}
                            </ul>
                          )}
                          {section.links && section.links.length > 0 && (
                            <div className={styles.secretLinks}>
                              {section.links.map(link => (
                                <a
                                  key={link.url}
                                  className={styles.secretLink}
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={link.note}
                                >
                                  {link.label}
                                  {link.note ? (
                                    <span className={styles.secretLinkNote}>{link.note}</span>
                                  ) : null}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}

                      {'giftListPreview' in m.secretPanel
                        && m.secretPanel.giftListPreview
                        && m.secretPanel.giftListPreview.length > 0 && (
                        <div className={styles.secretSection}>
                          <h3 className={styles.secretSectionTitle}>Gift list</h3>
                          <ul className={styles.secretTips}>
                            {m.secretPanel.giftListPreview.map(g => (
                              <li key={g.id}>
                                {g.name}
                                {g.forWhom ? ` — ${g.forWhom}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className={styles.secretActions}>
                        <div className={styles.secretSectionTitle}>Haven can help</div>
                        {m.secretPanel.actions.map(action => (
                          <button
                            key={action.id}
                            type="button"
                            className={styles.secretActionBtn}
                            disabled={busy}
                            onClick={() => void runSecretAction(m.secretPanel!.id, action.id)}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {m.links && m.links.length > 0 && (
                    <div className={styles.linkRow}>
                      {m.links.slice(0, 4).map(link => {
                        const safe = betaSafePath(link.route)
                        if (!safe || !isBetaFeatureOpen(safe)) return null
                        return (
                          <button
                            key={`${link.label}-${link.route}`}
                            type="button"
                            className={styles.timelineLink}
                            onClick={() => goLink(safe)}
                          >
                            {link.label} →
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {!m.links?.length && m.route && m.role === 'assistant' && (() => {
                    const safe = betaSafePath(m.route)
                    if (!safe || !isBetaFeatureOpen(safe)) return null
                    return (
                      <button
                        type="button"
                        className={styles.timelineLink}
                        onClick={() => goLink(safe)}
                      >
                        Open →
                      </button>
                    )
                  })()}
                </div>
              ))}
              {busy && <p className={styles.modalHint}>Thinking…</p>}
            </div>

            <div className={styles.composer}>
              <input
                type="text"
                className={styles.searchField}
                placeholder='Try “How do I cook tacos?” or “Where can I save?”'
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void send(input)
                }}
                aria-label="Message Haven"
                disabled={busy}
              />
              <button
                type="button"
                className={styles.sendBtn}
                onClick={() => void send(input)}
                disabled={busy || !input.trim()}
              >
                Send
              </button>
            </div>

            <div className={styles.chips}>
              {ASK_HAVEN_CHIPS.map(chip => (
                <button
                  key={chip.query}
                  type="button"
                  className={styles.chip}
                  onClick={() => handleChip(chip)}
                  disabled={busy}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
