import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SectionToggle } from '../ui/SectionToggle'
import { TodayHero } from './TodayHero'
import { DecisionScoreBar } from './DecisionScoreBar'
import { TodayDecisionCard } from './TodayDecisionCard'
import { groupTodayByPriority } from '../../lib/today/todayEngine'
import hie from '../../lib/intelligence/hie'
import { executeAction } from '../../lib/lifeOS/actionEngine'
import type { HavenActionType } from '../../lib/lifeOS/types'
import { TODAY_SECTIONS, type TodayDecision, type TodaySnapshot } from '../../lib/today/todayTypes'
import { useConnectionPreferences } from '../../hooks/useConnections'
import { hasSmartHomeConnected } from '../../lib/intelligence/credibilityEngine'
import { betaSafePath, isBetaSimplifiedUi } from '../../lib/betaFeatures'
import styles from './TodayInbox.module.css'

/** Beta: only modules that map to bills / groceries / dinner / expiring. */
const BETA_TODAY_MODULES = new Set(['shopping', 'pantry', 'meals', 'finance', 'budget'])

export interface TodayInboxProps {
  snapshot: TodaySnapshot | null
  loading: boolean
  userName?: string
  onRefresh: () => void
  onSnooze?: (observationId: number) => void
  onDismiss?: (observationId: number) => void
}

export function TodayInbox({
  snapshot,
  loading,
  userName,
  onRefresh,
  onSnooze,
  onDismiss,
}: TodayInboxProps) {
  const navigate = useNavigate()
  const connectionPrefs = useConnectionPreferences()
  const smartHomeConnected = hasSmartHomeConnected(connectionPrefs ?? [])
  const beta = isBetaSimplifiedUi()
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const decisions = useMemo(() => {
    const raw = snapshot?.decisions ?? []
    if (!beta) return raw
    return raw.filter(
      d =>
        !d.isDemo &&
        BETA_TODAY_MODULES.has(d.module) &&
        Boolean(d.actionLabel) &&
        (d.actionType === 'one-tap' || Boolean(d.actionRoute)),
    )
  }, [snapshot?.decisions, beta])

  const groups = useMemo(
    () => groupTodayByPriority(decisions),
    [decisions],
  )

  const stats = useMemo(() => {
    if (!beta || !snapshot) {
      return snapshot?.stats ?? {
        totalDecisions: 0,
        highPriority: 0,
        quickWins: 0,
        potentialSavings: 0,
        timeMinutes: 0,
        dayWeight: 'light' as const,
      }
    }
    const highPriority = decisions.filter(d => d.priority === 'do-today').length
    const quickWins = decisions.filter(d => d.quickWin).length
    const potentialSavings = decisions.reduce((s, d) => s + (d.savingsAmount ?? 0), 0)
    const timeMinutes = decisions.reduce((s, d) => s + (d.timeMinutes ?? 0), 0)
    return {
      totalDecisions: decisions.length,
      highPriority,
      quickWins,
      potentialSavings,
      timeMinutes,
      dayWeight: snapshot.stats.dayWeight,
    }
  }, [beta, snapshot, decisions])

  async function handleAction(decision: TodayDecision) {
    setActionMessage(null)
    setBusyId(decision.id)

    try {
      const payload = decision.actionPayload ?? {}
      const action = payload.action as string | undefined

      if (decision.actionType === 'one-tap' && action) {
        const result = await executeAction(
          decision.id,
          action as HavenActionType,
          payload,
        )
        if (result.success) {
          setActionMessage(result.message)
          if ((action === 'cookTonight' || action === 'buyToday') && decision.actionRoute) {
            navigate(betaSafePath(decision.actionRoute) ?? decision.actionRoute)
          }
          hie.refreshDebounced({ trigger: `action:${action}` })
          onRefresh()
        } else if (decision.actionRoute) {
          navigate(betaSafePath(decision.actionRoute) ?? decision.actionRoute)
        } else {
          setActionMessage(result.message)
        }
      } else if (decision.actionRoute) {
        navigate(betaSafePath(decision.actionRoute) ?? decision.actionRoute)
      }
    } catch (err) {
      setActionMessage(
        err instanceof Error
          ? err.message
          : 'Something didn’t go quite as planned. Let’s try again.',
      )
    } finally {
      setBusyId(null)
    }
  }

  const activeCount = stats.totalDecisions
  const primary =
    groups['do-today'][0] ?? groups['this-week'][0] ?? decisions[0] ?? null
  // Avoid duplicating the primary card in the first section list
  const hidePrimaryId = primary?.id

  return (
    <div className={styles.inbox}>
      <TodayHero
        userName={userName}
        decisionCount={activeCount}
        dayWeight={stats.dayWeight}
        primary={primary}
        primaryBusy={primary ? busyId === primary.id : false}
        onPrimaryAction={handleAction}
      />

      {activeCount > 0 && !beta && <DecisionScoreBar stats={stats} />}

      {actionMessage && <p className={styles.message}>{actionMessage}</p>}

      {activeCount === 0 && !loading && (
        <div className={styles.empty}>
          <p>
            {beta
              ? 'Nothing needs you right now. Bills and dinner can wait until you’re ready.'
              : 'Nothing urgent — enjoy the calm.'}
          </p>
          <Link to="/" className={styles.intelLink}>
            Back to Home →
          </Link>
        </div>
      )}

      {TODAY_SECTIONS.map(({ key, title }) => {
        let items = groups[key]
        if (hidePrimaryId) {
          items = items.filter(d => d.id !== hidePrimaryId)
        }
        if (items.length === 0) return null
        // Beta: hide "consider later" fluff — keep today + this week + completed.
        if (beta && key === 'consider-later') return null
        const defaultExpanded = key === 'do-today'
        const collapsible = key === 'completed' || key === 'consider-later' || key === 'this-week'
        const sectionTitle =
          beta && key === 'do-today' && primary
            ? 'Also when you’re ready'
            : title

        return (
          <SectionToggle
            key={key}
            title={sectionTitle}
            count={beta ? undefined : items.length}
            defaultExpanded={defaultExpanded}
            collapsible={collapsible}
            className={beta ? styles.lifeSection : undefined}
          >
            <div className={styles.cardList}>
              {items.map(decision => (
                <TodayDecisionCard
                  key={decision.id}
                  decision={decision}
                  busy={busyId === decision.id}
                  hasSmartHomeConnected={smartHomeConnected}
                  onAction={handleAction}
                  onSnooze={onSnooze}
                  onDismiss={onDismiss}
                />
              ))}
            </div>
          </SectionToggle>
        )
      })}

      <div className={styles.footer}>
        {beta ? (
          <>
            <Link to="/" className={styles.intelLink}>
              Back to Home →
            </Link>
            <p className={styles.footerWhisper}>I’ll keep watching quietly.</p>
          </>
        ) : (
          <>
            <Link to="/finance" className={styles.intelLink}>
              Money →
            </Link>
            <Link to="/savings" className={styles.intelLink}>
              Savings briefing →
            </Link>
            <button
              type="button"
              className={styles.refreshBtn}
              onClick={onRefresh}
              disabled={loading}
            >
              {loading ? 'Checking again…' : 'Check again'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
