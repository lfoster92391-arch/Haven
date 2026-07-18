import { getSupabase, isSyncConfigured, type Session, type User } from './supabaseClient'
import { recordSyncConsent, setStoredUserId } from './deviceId'
import { runSyncNow } from './syncEngine'

export { isSyncConfigured }

export async function getSession(): Promise<Session | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession()
  return session?.user ?? null
}

export type AuthResult = { ok: true; message: string } | { ok: false; message: string }

type AuthFlow = 'magic' | 'password' | 'signup'

const SIGNUP_FALLBACK =
  'Couldn’t create account. Check your connection, or try Password sign-in if you already registered.'

const EMAIL_SEND_FAILURE =
  'Account may have been created, but the confirmation email failed. Check Resend/Supabase logs, or ask admin to confirm user in Supabase Authentication → Users.'

/** True when a string is useless to show (e.g. JSON.stringify(Error) → "{}"). */
export function isBlankAuthMessage(raw: unknown): boolean {
  if (raw == null) return true
  if (typeof raw !== 'string') return false
  const t = raw.trim()
  if (!t) return true
  if (t === '{}' || t === '[]' || t === 'null' || t === 'undefined') return true
  if (t === '[object Object]') return true
  return false
}

/**
 * Extract a displayable auth error string. Never returns "{}" / "[object Object]".
 * Root cause of the Account banner showing `{}`: Auth API sometimes yields an empty
 * body; JSON.stringify(Error) is also "{}", and older code passed that through.
 */
export function formatAuthError(err: unknown): string {
  if (!err) return 'Something went wrong. Please try again.'
  if (typeof err === 'string' && err.trim() && !isBlankAuthMessage(err)) return err.trim()
  if (err instanceof Error && err.message && !isBlankAuthMessage(err.message)) {
    return err.message.trim()
  }
  if (typeof err === 'object' && err !== null) {
    const o = err as Record<string, unknown>
    for (const key of ['message', 'error_description', 'msg', 'error'] as const) {
      const v = o[key]
      if (typeof v === 'string' && v.trim() && !isBlankAuthMessage(v)) return v.trim()
    }
    // Prefer status/code for diagnosis when message is blank/"{}".
    const status = typeof o.status === 'number' ? o.status : null
    const code = typeof o.code === 'string' ? o.code : null
    if (status || code) {
      return `Auth error${status ? ` (${status})` : ''}${code ? `: ${code}` : ''}. Please try again.`
    }
  }
  return 'Couldn’t create account. Please try again.'
}

/** Pull raw message for mapping; blank/"{}" → ''. */
export function extractAuthErrorMessage(err: unknown): string {
  if (err == null) return ''
  if (typeof err === 'string') return isBlankAuthMessage(err) ? '' : err.trim()
  if (err instanceof Error && !isBlankAuthMessage(err.message)) return err.message.trim()
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>
    for (const key of ['message', 'error_description', 'error', 'msg'] as const) {
      const v = o[key]
      if (typeof v === 'string' && !isBlankAuthMessage(v)) return v.trim()
    }
    const status = typeof o.status === 'number' ? o.status : null
    const code = typeof o.code === 'string' ? o.code : null
    if (status || code) {
      return `Auth error${status ? ` (${status})` : ''}${code ? `: ${code}` : ''}`
    }
  }
  return ''
}

/** Map Supabase auth errors to actionable copy (never dump raw password errors onto OTP). */
export function mapAuthError(raw: string | unknown, flow: AuthFlow): string {
  const msg = typeof raw === 'string' ? raw.trim() : extractAuthErrorMessage(raw)
  const lower = msg.toLowerCase()
  const usable = !isBlankAuthMessage(msg)

  // Password grant error — must never be shown as-is for magic link.
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid credentials')
  ) {
    if (flow === 'magic') {
      return 'Could not send a magic link. Try Create account first (new emails), or confirm Email sign-in is enabled in Supabase Auth.'
    }
    if (flow === 'signup') {
      return SIGNUP_FALLBACK
    }
    return 'Email or password is incorrect. If you are new here, use Create account first — or switch to Magic link.'
  }

  if (
    lower.includes('user not found') ||
    lower.includes('email not found') ||
    lower.includes('signups not allowed') ||
    lower.includes('signup is disabled')
  ) {
    return 'No account for that email yet. Use Create account first, then try Magic link or Password.'
  }

  if (lower.includes('email not confirmed') || lower.includes('not confirmed')) {
    return 'Please confirm your email first (check inbox/spam for the confirmation link), then try again.'
  }

  if (lower.includes('rate limit') || lower.includes('too many requests') || lower.includes('security purposes')) {
    return 'Too many attempts. Wait a minute, then try again — and check spam for any earlier magic link.'
  }

  if (
    lower.includes('redirect') ||
    lower.includes('redirect_uri') ||
    lower.includes('url not allowed')
  ) {
    return 'Sign-in redirect is not allowlisted. In Supabase → Authentication → URL Configuration, add https://hellohaven.org/auth/callback (and /account).'
  }

  if (
    lower.includes('email provider') ||
    lower.includes('email logins are disabled') ||
    lower.includes('unsupported email provider')
  ) {
    return 'Email sign-in is disabled in Supabase. Enable Authentication → Providers → Email (magic link).'
  }

  if (
    lower.includes('already registered') ||
    lower.includes('user already exists') ||
    lower.includes('already been registered') ||
    lower.includes('email address is already')
  ) {
    return 'That email already has an account. Use the Password tab to sign in (or Magic link).'
  }

  if (
    lower.includes('password') &&
    (lower.includes('weak') ||
      lower.includes('least') ||
      lower.includes('characters') ||
      lower.includes('too short') ||
      lower.includes('strength'))
  ) {
    return 'Password is too weak. Use at least 8 characters (mix letters and numbers if required).'
  }

  // SMTP / confirmation email send failure (common after custom Resend SMTP misconfig).
  if (
    lower.includes('error sending') ||
    lower.includes('sending confirmation') ||
    lower.includes('confirmation email') ||
    lower.includes('unable to send') ||
    lower.includes('failed to send') ||
    lower.includes('smtp') ||
    lower.includes('resend') ||
    (lower.includes('email') && (lower.includes('send') || lower.includes('delivery')))
  ) {
    return EMAIL_SEND_FAILURE
  }

  // Fallback: never surface "{}", empty objects, or blank API bodies.
  if (flow === 'signup') {
    if (!usable) {
      // Most common production cause after custom SMTP: GoTrue 500 on email send → "{}" via auth-js.
      return EMAIL_SEND_FAILURE
    }
    if (msg.startsWith('Auth error')) return `${msg}. ${SIGNUP_FALLBACK}`
    return msg
  }
  if (flow === 'magic') {
    if (!usable) {
      return 'Could not send a magic link. Check your connection, or try Create account / Password instead.'
    }
    return `${msg} If this is your first time, use Create account — then check inbox/spam for the magic link.`
  }
  if (flow === 'password') {
    if (!usable) {
      return 'Could not sign in. Check your connection, or try Create account / Magic link.'
    }
    return `${msg} New here? Use Create account or Magic link.`
  }
  return usable ? msg : 'Something went wrong. Try again.'
}

function logAuthFailure(flow: AuthFlow, err: unknown): void {
  const extra =
    err && typeof err === 'object'
      ? {
          message: (err as { message?: unknown }).message,
          status: (err as { status?: unknown }).status,
          code: (err as { code?: unknown }).code,
          name: (err as { name?: unknown }).name,
        }
      : err
  console.error(`[haven auth] ${flow} failed`, err, extra)
}

/** Email magic link — passwordless. Redirects back via /auth/callback. */
export async function signInWithMagicLink(
  email: string,
  options?: { nextPath?: string },
): Promise<AuthResult> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, message: 'Sync is not configured on this deployment.' }
  }
  const trimmed = email.trim().toLowerCase()
  if (!trimmed || !trimmed.includes('@')) {
    return { ok: false, message: 'Enter a valid email address.' }
  }

  const next = options?.nextPath?.startsWith('/') ? options.nextPath : undefined
  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`
      : undefined

  // Explicit OTP path — never password grant.
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: true,
    },
  })
  if (error) {
    logAuthFailure('magic', error)
    return { ok: false, message: mapAuthError(error, 'magic') }
  }

  await recordSyncConsent()
  return {
    ok: true,
    message:
      'Check your email for a magic link (and spam). Free during beta — no credit card. New here and nothing arrives? Use Create account first.',
  }
}

export type OAuthProvider = 'apple' | 'google'

/** Apple / Google OAuth — soft auth for Welcome Home. */
export async function signInWithOAuth(
  provider: OAuthProvider,
  options?: { nextPath?: string },
): Promise<AuthResult> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, message: 'Sync is not configured on this deployment.' }
  }

  const next = options?.nextPath?.startsWith('/') ? options.nextPath : '/'
  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : undefined

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      // Stay in-app on failure so phones don't land on raw Supabase JSON.
      skipBrowserRedirect: true,
    },
  })

  if (error) {
    logAuthFailure('magic', error)
    const lower = (error.message ?? '').toLowerCase()
    if (lower.includes('provider') && (lower.includes('not enabled') || lower.includes('unsupported'))) {
      return {
        ok: false,
        message:
          provider === 'apple'
            ? 'Apple sign-in isn’t ready yet. Continue with Email for now — it works the same.'
            : 'Google sign-in isn’t ready yet. Continue with Email for now — it works the same.',
      }
    }
    return { ok: false, message: mapAuthError(error, 'magic') }
  }

  if (data.url && typeof window !== 'undefined') {
    await recordSyncConsent()
    window.location.assign(data.url)
    return { ok: true, message: 'Taking you to sign in…' }
  }

  return { ok: false, message: 'Something didn’t go quite as planned. Try Continue with Email.' }
}

/** Email + password sign-up (creates account if new). */
export async function signUpWithPassword(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, message: 'Sync isn’t configured on this deployment.' }
  }
  const trimmed = email.trim().toLowerCase()
  if (!trimmed || !trimmed.includes('@')) {
    return { ok: false, message: 'Enter a valid email address.' }
  }
  if (password.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters.' }
  }

  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined

  try {
    console.info('[haven auth] signUp calling supabase.auth.signUp', {
      email: trimmed,
      hasPassword: Boolean(password),
      emailRedirectTo: redirectTo ?? null,
    })

    const { data, error } = await supabase.auth.signUp({
      email: trimmed,
      password,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    })

    // Keep a loose handle — when error is set, some supabase typings narrow user to never.
    const createdUserId =
      data && typeof data === 'object' && data.user && typeof data.user.id === 'string'
        ? data.user.id
        : null

    if (error) {
      logAuthFailure('signup', error)
      // User row may exist even when confirmation email / SMTP fails.
      if (createdUserId) {
        return { ok: false, message: EMAIL_SEND_FAILURE }
      }
      // auth-js treats HTTP 500 as AuthRetryableFetchError and sets message to
      // JSON.stringify(Response) === "{}" — never reads body ("Error sending confirmation email").
      const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : null
      const name = typeof (error as { name?: unknown }).name === 'string' ? (error as { name: string }).name : ''
      const raw = extractAuthErrorMessage(error)
      if (
        isBlankAuthMessage(raw) &&
        (status === 500 || status === 0 || name.includes('Retryable') || name.includes('AuthRetryable'))
      ) {
        return { ok: false, message: EMAIL_SEND_FAILURE }
      }
      return { ok: false, message: mapAuthError(error, 'signup') }
    }

    await recordSyncConsent()
    if (data.user) await setStoredUserId(data.user.id)

    // Supabase anti-enumeration: existing user often returns user with empty identities.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return {
        ok: false,
        message: 'That email already has an account. Use the Password tab to sign in (or Magic link).',
      }
    }

    if (data.session) {
      void runSyncNow()
      try {
        const { upsertBetaTelemetry } = await import('../beta/telemetry')
        if (data.user?.email) {
          await upsertBetaTelemetry({
            userId: data.user.id,
            email: data.user.email,
            pathname: '/account',
          })
        }
      } catch {
        /* optional */
      }
      return {
        ok: true,
        message: "Account created. You're grandfathered — never pay for core Haven. Syncing across devices.",
      }
    }

    // Email confirm required — session null is expected success.
    if (data.user?.id) {
      return {
        ok: true,
        message:
          'Check your email to confirm your account (and spam), then sign in with Magic link or Password. Sync is free during beta.',
      }
    }

    console.error('[haven auth] signUp returned no error, no user, no session', data)
    return { ok: false, message: SIGNUP_FALLBACK }
  } catch (err) {
    logAuthFailure('signup', err)
    const status = err && typeof err === 'object' && typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : null
    const name = err && typeof err === 'object' && typeof (err as { name?: unknown }).name === 'string'
      ? (err as { name: string }).name
      : ''
    // Same 500→"{}" path when auth-js throws instead of returning { error }.
    if (status === 500 || status === 0 || name.includes('Retryable') || isBlankAuthMessage(extractAuthErrorMessage(err))) {
      return { ok: false, message: EMAIL_SEND_FAILURE }
    }
    const friendly = formatAuthError(err)
    return {
      ok: false,
      message: isBlankAuthMessage(friendly) ? SIGNUP_FALLBACK : friendly,
    }
  }
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, message: 'Sync is not configured on this deployment.' }
  }
  if (!password) {
    return {
      ok: false,
      message: 'Enter your password, or switch to Magic link for a passwordless sign-in.',
    }
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })
  if (error) {
    logAuthFailure('password', error)
    return { ok: false, message: mapAuthError(error, 'password') }
  }

  await recordSyncConsent()
  if (data.user) await setStoredUserId(data.user.id)
  void runSyncNow()
  try {
    const { upsertBetaTelemetry } = await import('../beta/telemetry')
    if (data.user?.email) {
      await upsertBetaTelemetry({
        userId: data.user.id,
        email: data.user.email,
        pathname: '/account',
      })
    }
  } catch {
    /* optional */
  }
  return { ok: true, message: 'Signed in. Syncing across devices — free during beta.' }
}

export async function signOut(): Promise<AuthResult> {
  const supabase = getSupabase()
  if (!supabase) return { ok: true, message: 'Signed out.' }
  const { error } = await supabase.auth.signOut()
  await setStoredUserId(null)
  if (error) {
    console.error('[haven auth] signOut failed', error)
    return { ok: false, message: mapAuthError(error, 'password') }
  }
  return { ok: true, message: 'Signed out. This device stays local-only until you sign in again.' }
}

export type AuthCallbackResult = AuthResult & { redirectTo?: string }

/**
 * Finish email confirm / magic-link redirect.
 * Prefers PKCE `?code=` exchange; also handles `token_hash` + hash tokens / error params.
 */
export async function completeAuthCallback(): Promise<AuthCallbackResult> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, message: 'Sync is not configured on this deployment.' }
  }

  if (typeof window === 'undefined') {
    return { ok: false, message: 'Sign-in must finish in the browser.' }
  }

  const url = new URL(window.location.href)
  const search = url.searchParams
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''))

  const errorDesc =
    search.get('error_description') ||
    hashParams.get('error_description') ||
    search.get('error') ||
    hashParams.get('error')
  if (errorDesc) {
    const decoded = decodeURIComponent(errorDesc.replace(/\+/g, ' '))
    console.error('[haven auth] callback error param', decoded)
    return {
      ok: false,
      message: mapAuthError(decoded, 'magic'),
      redirectTo: '/account',
    }
  }

  const code = search.get('code')
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      logAuthFailure('magic', error)
      return {
        ok: false,
        message: mapAuthError(error, 'magic'),
        redirectTo: '/account',
      }
    }
    await afterAuthSuccess(data.user)
    // Strip auth params so a refresh doesn’t reuse the one-time code.
    window.history.replaceState({}, document.title, `${url.origin}/auth/callback`)
    const nextRaw = search.get('next')
    const next =
      nextRaw && nextRaw.startsWith('/') && !nextRaw.startsWith('//')
        ? nextRaw
        : '/account?signedIn=1'
    return {
      ok: true,
      message: 'Email confirmed. You’re signed in — sync is free during beta.',
      redirectTo: next.includes('signedIn') ? next : `${next}${next.includes('?') ? '&' : '?'}signedIn=1`,
    }
  }

  const tokenHash = search.get('token_hash') || hashParams.get('token_hash')
  const otpType = (search.get('type') || hashParams.get('type') || 'email') as
    | 'signup'
    | 'invite'
    | 'magiclink'
    | 'recovery'
    | 'email_change'
    | 'email'
  if (tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    })
    if (error) {
      logAuthFailure('magic', error)
      return {
        ok: false,
        message: mapAuthError(error, 'magic'),
        redirectTo: '/account',
      }
    }
    await afterAuthSuccess(data.user)
    window.history.replaceState({}, document.title, `${url.origin}/auth/callback`)
    return {
      ok: true,
      message: 'Email confirmed. You’re signed in — sync is free during beta.',
      redirectTo: '/account?signedIn=1',
    }
  }

  // detectSessionInUrl may have already parsed hash tokens when the client was created.
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData.session?.user) {
    await afterAuthSuccess(sessionData.session.user)
    if (url.hash || search.has('access_token')) {
      window.history.replaceState({}, document.title, `${url.origin}/auth/callback`)
    }
    return {
      ok: true,
      message: 'You’re signed in. Sync is free during beta.',
      redirectTo: '/account?signedIn=1',
    }
  }

  return {
    ok: false,
    message:
      'No sign-in code found in this link. Request a new magic link from Account, or use Create account again.',
    redirectTo: '/account',
  }
}

async function afterAuthSuccess(user: User | null | undefined): Promise<void> {
  await recordSyncConsent()
  if (user?.id) await setStoredUserId(user.id)
  void runSyncNow()
  try {
    const { upsertBetaTelemetry } = await import('../beta/telemetry')
    if (user?.email) {
      await upsertBetaTelemetry({
        userId: user.id,
        email: user.email,
        pathname: '/auth/callback',
      })
    }
  } catch {
    /* optional */
  }
}

export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  const supabase = getSupabase()
  if (!supabase) {
    callback(null)
    return () => {}
  }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null)
  })
  return () => data.subscription.unsubscribe()
}
