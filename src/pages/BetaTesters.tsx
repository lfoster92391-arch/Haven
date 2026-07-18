import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { HelpHavenLearnInsights } from '../components/HelpHavenLearnInsights'
import { useHavenAuth } from '../hooks/useHavenSync'
import {
  buildHelpHavenInsightReport,
  evaluateAdminAccess,
  fetchBetaTesters,
  getBetaAdminEmail,
  getBetaAdminKey,
  lockAdminSession,
  unlockAdminSession,
  type BetaTesterRow,
  type BetaTestersResult,
  type HelpHavenInsightReport,
} from '../lib/beta'
import { fetchCloudFeedback, type CloudFeedbackRow } from '../lib/beta/feedback'
import listStyles from './ModulePage.module.css'
import styles from './BetaTesters.module.css'

type Tab = 'insights' | 'testers' | 'feedback'

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function statusLabel(s: BetaTesterRow['status']): string {
  if (s === 'active') return 'Active'
  if (s === 'quiet') return 'Quiet'
  return 'Inactive'
}

export function BetaTesters() {
  const { ready, email, signedIn } = useHavenAuth()
  const [access, setAccess] = useState(() => evaluateAdminAccess(email))
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('insights')
  const [testers, setTesters] = useState<BetaTestersResult | null>(null)
  const [feedback, setFeedback] = useState<{
    source: string
    rows: CloudFeedbackRow[]
    averageRating: number | null
    message?: string
  } | null>(null)
  const [insights, setInsights] = useState<HelpHavenInsightReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [enhancing, setEnhancing] = useState(false)

  useEffect(() => {
    setAccess(evaluateAdminAccess(email))
  }, [email])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, f] = await Promise.all([fetchBetaTesters(), fetchCloudFeedback()])
      setTesters(t)
      setFeedback(f)
      const report = await buildHelpHavenInsightReport(f.rows, { enhance: false })
      setInsights(report)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (access.allowed) void load()
  }, [access.allowed, load])

  async function polishWithAi() {
    if (!feedback) return
    setEnhancing(true)
    try {
      const report = await buildHelpHavenInsightReport(feedback.rows, { enhance: true })
      setInsights(report)
    } finally {
      setEnhancing(false)
    }
  }

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    const result = unlockAdminSession(pin)
    if (result.ok) {
      setPinError(null)
      setAccess(evaluateAdminAccess(email))
    } else {
      setPinError(result.message)
    }
  }

  function handleLock() {
    lockAdminSession()
    setAccess(evaluateAdminAccess(email))
  }

  if (!ready) {
    return (
      <div className={listStyles.page}>
        <PageHeader
          icon="🌿"
          title="Help Haven Learn"
          subtitle="Lisa’s calm reading of what Founders are teaching Haven."
        />
        <p className={styles.muted}>Loading…</p>
      </div>
    )
  }

  if (!access.allowed) {
    return (
      <div className={listStyles.page}>
        <PageHeader
          icon="🌿"
          title="Help Haven Learn"
          subtitle="Lisa’s calm reading of what Founders are teaching Haven."
        />
        <Card title="Admin access" compact>
          <p className={styles.body}>
            This view is for Lisa — summaries, themes, and Founders notes from Help Haven Learn.
            Enter the admin key
            {getBetaAdminKey() ? '' : ' (or type “beta” for a mock preview)'}.
          </p>
          <p className={styles.muted}>
            Allowlist email: <code>{getBetaAdminEmail()}</code>
            {signedIn ? ` · Signed in as ${email}` : ' · Not signed in'}
          </p>
          <form className={styles.pinForm} onSubmit={handleUnlock}>
            <label className={styles.label} htmlFor="beta-admin-pin">
              Admin key
            </label>
            <input
              id="beta-admin-pin"
              className={listStyles.input}
              type="password"
              autoComplete="current-password"
              value={pin}
              onChange={e => setPin(e.target.value)}
            />
            {pinError && <p className={styles.error}>{pinError}</p>}
            <Button type="submit" variant="primary">
              Unlock
            </Button>
          </form>
        </Card>
      </div>
    )
  }

  return (
    <div className={listStyles.page}>
      <PageHeader
        icon="🌿"
        title="Help Haven Learn"
        subtitle="What Founders are teaching Haven — summarized for you."
      />

      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'insights'}
            className={tab === 'insights' ? styles.tabActive : styles.tab}
            onClick={() => setTab('insights')}
          >
            Insights
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'feedback'}
            className={tab === 'feedback' ? styles.tabActive : styles.tab}
            onClick={() => setTab('feedback')}
          >
            Notes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'testers'}
            className={tab === 'testers' ? styles.tabActive : styles.tab}
            onClick={() => setTab('testers')}
          >
            Activity
          </button>
        </div>
        <div className={styles.toolbarActions}>
          <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleLock}>
            Lock
          </Button>
        </div>
      </div>

      <p className={styles.privacyNote}>
        Founders are partners raising Haven — not testers. This dashboard shows Help Haven Learn
        notes and activity metadata only — never pantry contents or private household details.
      </p>

      {tab === 'insights' && (
        <>
          {feedback?.message && <p className={styles.banner}>{feedback.message}</p>}
          {insights ? (
            <HelpHavenLearnInsights
              report={insights}
              enhancing={enhancing}
              onRefreshEnhance={() => void polishWithAi()}
            />
          ) : (
            <p className={styles.muted}>{loading ? 'Gathering notes…' : 'No insights yet.'}</p>
          )}
        </>
      )}

      {tab === 'testers' && testers && (
        <>
          {testers.message && <p className={styles.banner}>{testers.message}</p>}
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <span className={styles.summaryValue}>{testers.summary.total}</span>
              <span className={styles.summaryLabel}>Founding accounts</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryValue}>{testers.summary.activeWeek}</span>
              <span className={styles.summaryLabel}>Active this week</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryValue}>{testers.summary.activeToday}</span>
              <span className={styles.summaryLabel}>Active today</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryValue}>{testers.summary.neverSynced}</span>
              <span className={styles.summaryLabel}>Never synced</span>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Joined</th>
                  <th>Last active</th>
                  <th>Last sync</th>
                  <th>Devices</th>
                  <th>Module</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {testers.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={styles.empty}>
                      No signed-in Founding accounts yet.
                    </td>
                  </tr>
                ) : (
                  testers.rows.map(row => (
                    <tr key={row.userId}>
                      <td>{row.displayName}</td>
                      <td>{row.email}</td>
                      <td>{formatWhen(row.joinedAt)}</td>
                      <td>{formatWhen(row.lastActiveAt)}</td>
                      <td>{formatWhen(row.lastSyncAt)}</td>
                      <td>{row.deviceCount}</td>
                      <td>{row.lastModule ?? '—'}</td>
                      <td>
                        <span className={styles[`status_${row.status}`]}>
                          {statusLabel(row.status)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className={styles.legend}>
            Active = within 7 days · Quiet = 8–30 days · Inactive = 30+ days or never active · Source:{' '}
            {testers.source}
          </p>
        </>
      )}

      {tab === 'feedback' && feedback && (
        <>
          {feedback.message && <p className={styles.banner}>{feedback.message}</p>}
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <span className={styles.summaryValue}>
                {feedback.averageRating != null ? feedback.averageRating.toFixed(1) : '—'}
              </span>
              <span className={styles.summaryLabel}>Average feeling</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryValue}>{feedback.rows.length}</span>
              <span className={styles.summaryLabel}>Notes shared</span>
            </div>
          </div>

          <ul className={styles.feedbackList}>
            {feedback.rows.length === 0 ? (
              <li className={styles.empty}>No Help Haven Learn notes yet.</li>
            ) : (
              feedback.rows.map(row => (
                <li key={row.id} className={styles.feedbackItem}>
                  <div className={styles.feedbackHead}>
                    <span className={styles.stars}>{'★'.repeat(row.rating)}{'☆'.repeat(5 - row.rating)}</span>
                    <span className={styles.recommend}>{row.recommend.replace('_', ' ')}</span>
                    <span className={styles.who}>
                      {row.is_guest || !row.email ? 'Founding Member (guest)' : row.email}
                    </span>
                    <span className={styles.when}>{formatWhen(row.created_at)}</span>
                  </div>
                  {row.working_well && (
                    <p className={styles.fbLine}>
                      <strong>Landing:</strong> {row.working_well}
                    </p>
                  )}
                  {row.confusing_broken && (
                    <p className={styles.fbLine}>
                      <strong>Friction:</strong> {row.confusing_broken}
                    </p>
                  )}
                  {(row.build_next || row.build_next_note) && (
                    <p className={styles.fbLine}>
                      <strong>Learn next:</strong> {row.build_next}
                      {row.build_next_note ? ` — ${row.build_next_note}` : ''}
                    </p>
                  )}
                </li>
              ))
            )}
          </ul>
          <p className={styles.legend}>Source: {feedback.source}</p>
        </>
      )}

      <p className={styles.footerLinks}>
        <Link to="/account">Account & Sync</Link>
        {' · '}
        <Link to="/vision#pricing">Pricing philosophy</Link>
      </p>
    </div>
  )
}
