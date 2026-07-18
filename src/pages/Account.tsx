import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { FOUNDER_VISION } from '../content/founderVision'
import { useSyncStatus } from '../hooks/useHavenSync'
import { isBetaSimplifiedUi } from '../lib/betaFeatures'
import {
  getSyncConfigDebug,
  isSyncConfigured,
  signInWithMagicLink,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  formatAuthError,
  isBlankAuthMessage,
  SYNC_DEFERRED,
  SYNC_TABLE_LABELS,
  SYNC_TABLES,
} from '../lib/sync'
import { FoundingMemberImpactCard } from '../components/FoundingMemberImpact'
import listStyles from './ModulePage.module.css'
import styles from './Account.module.css'

type AuthMode = 'magic' | 'password' | 'signup'

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function Account() {
  const { ready, signedIn, email, status, lastResult, busy, syncNow, refresh } = useSyncStatus()
  const [searchParams, setSearchParams] = useSearchParams()
  const [mode, setMode] = useState<AuthMode>('magic')
  const [emailInput, setEmailInput] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const beta = isBetaSimplifiedUi()

  useEffect(() => {
    if (lastResult) {
      if (lastResult.ok) setMessage(lastResult.message)
      else {
        const t = (lastResult.message ?? '').trim()
        setError(
          !t || t === '{}' || t === '[object Object]'
            ? 'Sync failed. Check your connection and try again.'
            : lastResult.message,
        )
      }
    }
  }, [lastResult])

  // After /auth/callback redirect — celebrate signed-in state once.
  useEffect(() => {
    if (!ready) return
    if (searchParams.get('signedIn') !== '1') return

    if (signedIn) {
      setError(null)
      setMessage('You’re signed in. Syncing across devices is free during beta.')
      setSearchParams({}, { replace: true })
      void syncNow()
      return
    }

    // Session may still be hydrating after PKCE exchange — wait before failing.
    const timer = window.setTimeout(() => {
      if (searchParams.get('signedIn') !== '1') return
      setMessage(null)
      setError(
        'Confirmation finished, but no session yet. Try Magic link again from this same browser, or Create account.',
      )
      setSearchParams({}, { replace: true })
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [ready, signedIn, searchParams, setSearchParams, syncNow])

  // Legacy redirects that still land on /account?code=… (older emails).
  useEffect(() => {
    const code = searchParams.get('code')
    const tokenHash = searchParams.get('token_hash')
    if (!code && !tokenHash) return
    const qs = window.location.search
    window.location.replace(`/auth/callback${qs}${window.location.hash}`)
  }, [searchParams])

  function displayAuthMessage(raw: string | null | undefined, fallback: string): string {
    if (isBlankAuthMessage(raw)) return fallback
    return (raw ?? '').trim()
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setError(null)
    try {
      let result
      if (mode === 'magic') {
        result = await signInWithMagicLink(emailInput)
      } else if (mode === 'signup') {
        result = await signUpWithPassword(emailInput, password)
      } else {
        result = await signInWithPassword(emailInput, password)
      }
      if (result.ok) {
        setMessage(result.message)
        setPassword('')
        await refresh()
      } else {
        console.error('[haven account] auth failed', mode, result.message)
        setError(
          displayAuthMessage(
            result.message,
            mode === 'signup'
              ? 'Couldn’t create account. Check your connection, or try Password sign-in if you already registered.'
              : 'Something went wrong. Try again.',
          ),
        )
      }
    } catch (err) {
      console.error('[haven account] auth threw', mode, err)
      const friendly = formatAuthError(err)
      setError(
        displayAuthMessage(
          friendly,
          mode === 'signup'
            ? 'Couldn’t create account. Check your connection, or try Password sign-in if you already registered.'
            : 'Something went wrong. Try again.',
        ),
      )
    }
  }

  async function handleSignOut() {
    setMessage(null)
    setError(null)
    const result = await signOut()
    if (result.ok) setMessage(result.message)
    else setError(displayAuthMessage(result.message, 'Something didn’t go quite as planned signing out. Let’s try again.'))
    await refresh()
  }

  async function handleSync() {
    setMessage(null)
    setError(null)
    const result = await syncNow()
    if (result.ok) setMessage(result.message)
    else setError(displayAuthMessage(result.message, 'Something didn’t go quite as planned syncing. Check your connection and try again.'))
  }

  const configured = isSyncConfigured()
  const syncDebug = getSyncConfigDebug()

  return (
    <div className={listStyles.page}>
      <PageHeader
        icon="🔐"
        title="Account & Sync"
        subtitle={beta ? 'Sign in to sync — optional, whenever you’re ready' : 'Optional — Haven works fully without signing in'}
      />

      <aside className={styles.betaBanner} aria-label="Beta pricing">
        <p className={styles.betaLead}>{FOUNDER_VISION.pricingPhilosophy.betaFreeLine}</p>
        <p className={styles.betaDetail}>
          {FOUNDER_VISION.pricingPhilosophy.grandfatherLine}
        </p>
        {!beta && (
          <p className={styles.betaDetail}>{FOUNDER_VISION.pricingPhilosophy.betaFreeDetail}</p>
        )}
      </aside>

      <FoundingMemberImpactCard />

      {/* Dev/admin only — hide host/key debug chrome on open beta */}
      {!beta && (
        <p className={styles.muted} aria-label="Sync configuration status">
          Sync configured: {syncDebug.configured ? 'yes' : 'no'}
          {syncDebug.urlHost ? ` · host: ${syncDebug.urlHost}` : ''}
          {!syncDebug.hasUrl || !syncDebug.hasAnonKey
            ? ` · missing: ${[!syncDebug.hasUrl && 'URL', !syncDebug.hasAnonKey && 'anon key'].filter(Boolean).join(', ')}`
            : ''}
        </p>
      )}

      {!ready ? (
        <p className={styles.muted}>Loading account…</p>
      ) : (
        <>
          {!configured && (
            <Card title="Configure sync" compact>
              <p className={styles.body}>
                Cloud sync is not configured on this deployment. Haven still works completely offline
                on this device. To enable sync, add{' '}
                <code className={styles.code}>VITE_SUPABASE_URL</code> and{' '}
                <code className={styles.code}>VITE_SUPABASE_ANON_KEY</code> — see{' '}
                <code className={styles.code}>SYNC.md</code>.
              </p>
            </Card>
          )}

          {configured && !signedIn && (
            <Card title="Sign in to sync across devices" compact>
              <p className={styles.body}>
                Guest mode stays local. Sign in only if you want free multi-device sync during beta.
                Your data remains on this device either way.
              </p>
              {mode === 'signup' && (
                <p className={styles.body}>
                  {FOUNDER_VISION.pricingPhilosophy.grandfatherLine}{' '}
                  {FOUNDER_VISION.pricingPhilosophy.grandfatherDetail}
                </p>
              )}

              <div className={styles.modeTabs} role="tablist" aria-label="Sign-in method">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'magic'}
                  className={mode === 'magic' ? styles.tabActive : styles.tab}
                  onClick={() => {
                    setMode('magic')
                    setError(null)
                    setMessage(null)
                    setPassword('')
                  }}
                >
                  Magic link
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'password'}
                  className={mode === 'password' ? styles.tabActive : styles.tab}
                  onClick={() => {
                    setMode('password')
                    setError(null)
                    setMessage(null)
                  }}
                >
                  Password
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signup'}
                  className={mode === 'signup' ? styles.tabActive : styles.tab}
                  onClick={() => {
                    setMode('signup')
                    setError(null)
                    setMessage(null)
                  }}
                >
                  Create account
                </button>
              </div>

              <form className={styles.form} onSubmit={handleAuth} key={mode}>
                <label className={styles.label} htmlFor="account-email">
                  Email
                </label>
                <input
                  id="account-email"
                  className={listStyles.input}
                  type="email"
                  autoComplete="email"
                  name="email"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  required
                />
                {(mode === 'password' || mode === 'signup') && (
                  <>
                    <label className={styles.label} htmlFor="account-password">
                      Password
                    </label>
                    <input
                      id="account-password"
                      className={listStyles.input}
                      type="password"
                      name="password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={8}
                    />
                  </>
                )}
                {mode === 'magic' && (
                  <p className={styles.hint}>
                    Passwordless — we email you a one-time link. First time? Prefer{' '}
                    <button
                      type="button"
                      className={styles.inlineLink}
                      onClick={() => {
                        setMode('signup')
                        setError(null)
                        setMessage(null)
                      }}
                    >
                      Create account
                    </button>
                    .
                  </p>
                )}
                <Button type="submit" variant="primary">
                  {mode === 'magic'
                    ? 'Email me a magic link'
                    : mode === 'signup'
                      ? 'Create free account'
                      : 'Sign in'}
                </Button>
              </form>
            </Card>
          )}

          {configured && signedIn && (
            <Card title="Signed in" compact>
              <p className={styles.body}>
                <strong>{email}</strong>
              </p>
              <p className={styles.syncingNote}>Syncing across devices — free during beta.</p>
              <div className={styles.statusGrid}>
                <div>
                  <span className={styles.statusLabel}>Last synced</span>
                  <span className={styles.statusValue}>{formatWhen(status?.lastSyncedAt)}</span>
                </div>
                <div>
                  <span className={styles.statusLabel}>Pending changes</span>
                  <span className={styles.statusValue}>{status?.pendingCount ?? 0}</span>
                </div>
                <div>
                  <span className={styles.statusLabel}>This device</span>
                  <span className={styles.statusValueMono}>
                    {status?.deviceId ? `${status.deviceId.slice(0, 8)}…` : '—'}
                  </span>
                </div>
              </div>
              <div className={styles.actions}>
                <Button type="button" variant="primary" onClick={handleSync} disabled={busy}>
                  {busy ? 'Syncing…' : 'Sync now'}
                </Button>
                <Button type="button" variant="secondary" onClick={handleSignOut}>
                  Sign out
                </Button>
              </div>
            </Card>
          )}

          {(message || error) && (
            <p className={error ? styles.error : styles.success} role="status">
              {error ?? message}
            </p>
          )}

          {beta ? (
            <Card title="Privacy" compact>
              <p className={styles.body}>
                Guest mode stays on this device. Sign in only for free multi-device sync during beta.
              </p>
            </Card>
          ) : (
            <>
              <Card title="What syncs" compact>
                <p className={styles.body}>
                  Local-first: Dexie on this device is primary. Cloud is an optional sync and backup layer.
                </p>
                <ul className={styles.list}>
                  {SYNC_TABLES.map(t => (
                    <li key={t}>{SYNC_TABLE_LABELS[t]}</li>
                  ))}
                </ul>
                <p className={styles.muted}>Stays local (v1):</p>
                <ul className={styles.listMuted}>
                  {SYNC_DEFERRED.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Card>

              <Card title="Privacy" compact>
                <p className={styles.body}>
                  {FOUNDER_VISION.pricingPhilosophy.betaAboutNote}{' '}
                  {FOUNDER_VISION.pricingPhilosophy.grandfatherLine}
                </p>
                <p className={styles.body}>
                  Signing in enables free multi-device sync and quietly helps Haven learn with light
                  activity metadata (last active, last sync) — never pantry contents or private notes.
                </p>
                <p className={styles.body}>
                  Sync uses encrypted transport (HTTPS). Your rows are isolated with row-level security —
                  only your account can read them. Photo blobs stay on this device in v1. You can keep
                  using Haven forever as a guest with no account.
                </p>
                <p className={styles.body}>
                  <Link to="/my-life">🏡 Life profile &amp; Get to Know You</Link>
                  {' · '}
                  <Link to="/vision#pricing">Pricing philosophy</Link>
                  {' · '}
                  <Link to="/support">Support Haven (optional)</Link>
                </p>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
