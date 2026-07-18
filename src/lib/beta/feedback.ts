import {
  db,
  type BetaFeedbackPrompt,
  type BetaFeedbackResponse,
  type BetaNextBuild,
  type BetaRecommend,
  type HelpHavenIntent,
} from '../../db/database'
import { getSupabase, isSyncConfigured } from '../sync/supabaseClient'

const PROMPT_ID = 'default' as const
const DAY_MS = 86_400_000
const DISMISS_DAYS = 7
const SUBMIT_COOLDOWN_DAYS = 30

export const BUILD_NEXT_CHIPS: { id: BetaNextBuild; label: string }[] = [
  { id: 'shopping', label: 'Shopping' },
  { id: 'meals', label: 'Meals' },
  { id: 'money', label: 'Money' },
  { id: 'sync', label: 'Sync' },
  { id: 'packages', label: 'Packages' },
  { id: 'other', label: 'Something else' },
]

async function getOrCreatePrompt(): Promise<BetaFeedbackPrompt> {
  const existing = await db.betaFeedbackPrompt.get(PROMPT_ID)
  if (existing) return existing
  const now = new Date().toISOString()
  const row: BetaFeedbackPrompt = {
    id: PROMPT_ID,
    firstOpenAt: now,
    sessionCount: 1,
    updatedAt: now,
  }
  await db.betaFeedbackPrompt.put(row)
  return row
}

/** Call once per app session (Layout mount). Increments session count. */
export async function recordAppSession(): Promise<void> {
  try {
    const prompt = await getOrCreatePrompt()
    const now = new Date().toISOString()
    const firstOpenAt = prompt.firstOpenAt ?? now
    await db.betaFeedbackPrompt.put({
      ...prompt,
      firstOpenAt,
      sessionCount: (prompt.sessionCount ?? 0) + 1,
      updatedAt: now,
    })
  } catch {
    /* table may not exist during HMR */
  }
}

export type FeedbackShowReason = 'session' | 'days' | 'signin' | null

/**
 * Soft eligibility: 3rd+ session OR 2+ days since first open OR just signed in.
 * Respects dismiss (7d) and submit (30d) cooldowns. Never first launch (session 1).
 */
export async function shouldShowFeedbackPrompt(opts?: {
  justSignedIn?: boolean
}): Promise<{ show: boolean; reason: FeedbackShowReason }> {
  try {
    const prompt = await getOrCreatePrompt()
    const now = Date.now()

    if (prompt.submittedAt) {
      const submitted = Date.parse(prompt.submittedAt)
      if (Number.isFinite(submitted) && now - submitted < SUBMIT_COOLDOWN_DAYS * DAY_MS) {
        return { show: false, reason: null }
      }
    }
    if (prompt.dismissedUntil) {
      const until = Date.parse(prompt.dismissedUntil)
      if (Number.isFinite(until) && now < until) {
        return { show: false, reason: null }
      }
    }

    const sessions = prompt.sessionCount ?? 0
    if (sessions <= 1 && !opts?.justSignedIn) {
      return { show: false, reason: null }
    }

    if (opts?.justSignedIn) {
      return { show: true, reason: 'signin' }
    }

    if (sessions >= 3) {
      return { show: true, reason: 'session' }
    }

    const first = prompt.firstOpenAt ? Date.parse(prompt.firstOpenAt) : NaN
    if (Number.isFinite(first) && now - first >= 2 * DAY_MS && sessions >= 2) {
      return { show: true, reason: 'days' }
    }

    return { show: false, reason: null }
  } catch {
    return { show: false, reason: null }
  }
}

export async function markFeedbackShown(): Promise<void> {
  const prompt = await getOrCreatePrompt()
  const now = new Date().toISOString()
  await db.betaFeedbackPrompt.put({
    ...prompt,
    lastShownAt: now,
    updatedAt: now,
  })
}

export async function dismissFeedbackPrompt(): Promise<void> {
  const prompt = await getOrCreatePrompt()
  const now = new Date()
  const until = new Date(now.getTime() + DISMISS_DAYS * DAY_MS).toISOString()
  await db.betaFeedbackPrompt.put({
    ...prompt,
    dismissedUntil: until,
    lastShownAt: now.toISOString(),
    updatedAt: now.toISOString(),
  })
}

export interface FeedbackSubmitInput {
  rating: number
  recommend?: BetaRecommend
  intent?: HelpHavenIntent
  pagePath?: string
  note?: string
  fromVoice?: boolean
  workingWell?: string
  confusingBroken?: string
  buildNext?: BetaNextBuild | string
  buildNextNote?: string
}

function recommendFromIntent(intent: HelpHavenIntent | undefined, rating: number): BetaRecommend {
  if (intent === 'love' || rating >= 5) return 'yes'
  if (intent === 'bug' || intent === 'confused') return rating >= 4 ? 'maybe' : 'not_yet'
  if (rating >= 4) return 'yes'
  if (rating >= 3) return 'maybe'
  return 'not_yet'
}

function routeNoteByIntent(
  intent: HelpHavenIntent | undefined,
  note: string | undefined,
): Pick<FeedbackSubmitInput, 'workingWell' | 'confusingBroken' | 'buildNext' | 'buildNextNote'> {
  const text = note?.trim()
  if (!text) {
    if (intent === 'idea' || intent === 'wish') return { buildNext: 'other' }
    return {}
  }
  if (intent === 'love') return { workingWell: text }
  if (intent === 'bug' || intent === 'confused') return { confusingBroken: text }
  if (intent === 'idea' || intent === 'wish' || intent === 'voice') {
    return { buildNext: 'other', buildNextNote: text }
  }
  return { workingWell: text }
}

export async function submitBetaFeedback(input: FeedbackSubmitInput): Promise<void> {
  const now = new Date().toISOString()
  let email: string | undefined
  let userId: string | undefined

  const supabase = getSupabase()
  if (supabase && isSyncConfigured()) {
    const { data } = await supabase.auth.getSession()
    email = data.session?.user?.email ?? undefined
    userId = data.session?.user?.id
  }

  const routed = routeNoteByIntent(input.intent, input.note)
  const workingWell = input.workingWell?.trim() || routed.workingWell
  const confusingBroken = input.confusingBroken?.trim() || routed.confusingBroken
  const buildNext = input.buildNext ?? routed.buildNext
  const buildNextNote = input.buildNextNote?.trim() || routed.buildNextNote
  const recommend = input.recommend ?? recommendFromIntent(input.intent, input.rating)

  // Encode intent for cloud rows that don't have an intent column yet
  const cloudWorking =
    input.intent && workingWell
      ? `[${input.intent}] ${workingWell}`
      : workingWell ?? (input.intent === 'love' ? `[${input.intent}]` : null)
  const cloudConfused =
    input.intent && confusingBroken
      ? `[${input.intent}] ${confusingBroken}`
      : confusingBroken ?? (input.intent === 'bug' || input.intent === 'confused' ? `[${input.intent}]` : null)
  const cloudNextNote =
    input.intent && buildNextNote
      ? `[${input.intent}] ${buildNextNote}`
      : buildNextNote ?? (input.intent === 'idea' || input.intent === 'wish' || input.intent === 'voice'
        ? `[${input.intent}]`
        : null)

  const localId = await db.betaFeedbackResponses.add({
    rating: input.rating,
    recommend,
    intent: input.intent,
    pagePath: input.pagePath,
    workingWell,
    confusingBroken,
    buildNext,
    buildNextNote,
    fromVoice: input.fromVoice,
    email,
    userId,
    createdAt: now,
    syncedToCloud: false,
  })

  let synced = false
  if (supabase && isSyncConfigured() && userId) {
    const { error } = await supabase.from('haven_beta_feedback').insert({
      user_id: userId,
      email: email ?? null,
      rating: input.rating,
      recommend,
      working_well: cloudWorking,
      confusing_broken: cloudConfused,
      build_next: buildNext ?? null,
      build_next_note: cloudNextNote,
      created_at: now,
      is_guest: false,
    })
    synced = !error
    if (localId != null) {
      await db.betaFeedbackResponses.update(localId, { syncedToCloud: synced })
    }
  }

  const prompt = await getOrCreatePrompt()
  await db.betaFeedbackPrompt.put({
    ...prompt,
    submittedAt: now,
    dismissedUntil: undefined,
    lastShownAt: now,
    updatedAt: now,
  })

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('haven:founders-impact-updated'))
  }
}

export interface CloudFeedbackRow {
  id: string
  user_id: string | null
  email: string | null
  rating: number
  recommend: string
  working_well: string | null
  confusing_broken: string | null
  build_next: string | null
  build_next_note: string | null
  created_at: string
  is_guest: boolean
}

export async function fetchCloudFeedback(): Promise<{
  source: 'live' | 'mock' | 'local'
  rows: CloudFeedbackRow[]
  averageRating: number | null
  message?: string
}> {
  const local = await db.betaFeedbackResponses.orderBy('createdAt').reverse().limit(50).toArray()

  if (!isSyncConfigured()) {
    const mock: CloudFeedbackRow[] = [
      {
        id: 'mock-f1',
        user_id: 'mock-1',
        email: 'alex@example.com',
        rating: 5,
        recommend: 'yes',
        working_well: '[love] Daily briefing feels calm — like someone already checked on the house.',
        confusing_broken: null,
        build_next: 'packages',
        build_next_note: '[wish] Would love package tracking quietly',
        created_at: new Date(Date.now() - DAY_MS).toISOString(),
        is_guest: false,
      },
      {
        id: 'mock-f2',
        user_id: null,
        email: null,
        rating: 4,
        recommend: 'maybe',
        working_well: '[love] Cook Tonight suggestions feel personal',
        confusing_broken: '[confused] Not sure where bills live when I open Money',
        build_next: 'money',
        build_next_note: null,
        created_at: new Date(Date.now() - 3 * DAY_MS).toISOString(),
        is_guest: true,
      },
      {
        id: 'mock-f3',
        user_id: 'mock-3',
        email: 'sam@example.com',
        rating: 5,
        recommend: 'yes',
        working_well: '[love] I love that Haven remembers my recipe version',
        confusing_broken: null,
        build_next: 'meals',
        build_next_note: '[idea] More family recipe notes',
        created_at: new Date(Date.now() - 2 * DAY_MS).toISOString(),
        is_guest: false,
      },
      {
        id: 'mock-f4',
        user_id: 'mock-4',
        email: 'jordan@example.com',
        rating: 3,
        recommend: 'maybe',
        working_well: '[love] Leaf feedback feels kind',
        confusing_broken: '[bug] Camera scan felt confusing on my phone',
        build_next: 'shopping',
        build_next_note: null,
        created_at: new Date(Date.now() - 5 * DAY_MS).toISOString(),
        is_guest: false,
      },
      {
        id: 'mock-f5',
        user_id: null,
        email: null,
        rating: 4,
        recommend: 'yes',
        working_well: '[love] Relief when closing the app',
        confusing_broken: '[confused] Hard to find where sync status lives',
        build_next: 'sync',
        build_next_note: '[voice] Wish sync felt clearer',
        created_at: new Date(Date.now() - 6 * DAY_MS).toISOString(),
        is_guest: true,
      },
    ]
    return {
      source: 'mock',
      rows: mock,
      averageRating: 4.2,
      message: 'Preview data — live Founders notes appear when Supabase feedback is connected.',
    }
  }

  const supabase = getSupabase()
  if (!supabase) {
    return mapLocalAsCloud(local, 'local')
  }

  const { data, error } = await supabase
    .from('haven_beta_feedback')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error || !data) {
    return {
      ...mapLocalAsCloud(local, 'local'),
      message: error
        ? `Cloud feedback unavailable (${error.message}). Showing local responses.`
        : 'Showing local responses.',
    }
  }

  const rows = data as CloudFeedbackRow[]
  const avg =
    rows.length > 0 ? rows.reduce((s, r) => s + (r.rating || 0), 0) / rows.length : null
  return { source: 'live', rows, averageRating: avg }
}

function mapLocalAsCloud(
  local: BetaFeedbackResponse[],
  source: 'local' | 'mock',
): {
  source: 'live' | 'mock' | 'local'
  rows: CloudFeedbackRow[]
  averageRating: number | null
} {
  const rows: CloudFeedbackRow[] = local.map(r => ({
    id: String(r.id ?? r.createdAt),
    user_id: r.userId ?? null,
    email: r.email ?? null,
    rating: r.rating,
    recommend: r.recommend,
    working_well: r.workingWell ?? null,
    confusing_broken: r.confusingBroken ?? null,
    build_next: (r.buildNext as string) ?? null,
    build_next_note: r.buildNextNote ?? null,
    created_at: r.createdAt,
    is_guest: !r.userId,
  }))
  const avg =
    rows.length > 0 ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : null
  return { source, rows, averageRating: avg }
}
