import { differenceInCalendarDays, parseISO } from 'date-fns'
import { db, type BetaFeedbackPrompt, type BetaFeedbackResponse } from '../../db/database'

const PROMPT_ID = 'default' as const

/**
 * Curated Vision slices that can credit Founders who asked for them.
 * Match is soft — keyword overlap with their Help Haven Learn notes.
 */
export const SHIPPED_FOUNDERS_FEATURES = [
  {
    id: 'savings-briefing',
    title: 'Savings morning briefing',
    thankYou:
      'I remember you wanting a calmer start to the day. Savings is now Haven’s morning briefing — not a shopping list.',
    match: /\b(brief|morning|savings|shopping|calm|deal|coupon)\b/i,
  },
  {
    id: 'cook-learning',
    title: 'Cook Tonight learning',
    thankYou:
      'I remember you caring about meals that feel like yours. Haven now learns after you cook — and keeps a Recipe Log.',
    match: /\b(recipe|cook|meal|dinner|kitchen|tonight)\b/i,
  },
  {
    id: 'havens-eyes',
    title: 'Haven’s eyes',
    thankYou:
      'I remember you wanting Haven to see the home, not just scan barcodes. You can show me a shelf when you’re ready.',
    match: /\b(scan|camera|barcode|pantry|fridge|shelf|vision|eyes)\b/i,
  },
  {
    id: 'recipe-evolution',
    title: 'Recipe evolution',
    thankYou:
      'I remember you changing recipes your way. Haven can now notice repeats and offer to make them your default version.',
    match: /\b(version|mushroom|add|change|personal|favorite|family)\b/i,
  },
] as const

export type ShippedFoundersFeatureId = (typeof SHIPPED_FOUNDERS_FEATURES)[number]['id']

export interface FoundingMemberImpact {
  ideasSubmitted: number
  bugsFound: number
  featuresAdopted: number
  communityRating: number | null
  daysTogether: number
  recommendWarmth: 'yes' | 'maybe' | 'not_yet' | null
  adoptedFeatures: { id: string; title: string }[]
  empty: boolean
}

export interface FoundersRememberedThanks {
  featureId: string
  title: string
  thankYou: string
}

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

function feedbackBlob(row: BetaFeedbackResponse): string {
  return [row.workingWell, row.confusingBroken, row.buildNextNote, String(row.buildNext ?? '')]
    .filter(Boolean)
    .join(' ')
}

function matchShippedFeatures(responses: BetaFeedbackResponse[]) {
  const blob = responses.map(feedbackBlob).join(' \n ')
  if (!blob.trim()) return [] as { id: string; title: string }[]
  return SHIPPED_FOUNDERS_FEATURES.filter(f => f.match.test(blob)).map(f => ({
    id: f.id,
    title: f.title,
  }))
}

export async function getFoundingMemberImpact(): Promise<FoundingMemberImpact> {
  const [prompt, responses] = await Promise.all([
    getOrCreatePrompt(),
    db.betaFeedbackResponses.toArray(),
  ])

  const ideasSubmitted = responses.filter(
    r =>
      r.intent === 'idea' ||
      r.intent === 'wish' ||
      r.intent === 'voice' ||
      Boolean(r.workingWell?.trim() || r.buildNext || r.buildNextNote?.trim()),
  ).length
  const bugsFound = responses.filter(
    r => r.intent === 'bug' || r.intent === 'confused' || Boolean(r.confusingBroken?.trim()),
  ).length
  const adoptedFeatures = matchShippedFeatures(responses)
  const ratings = responses.map(r => r.rating).filter(n => n >= 1 && n <= 5)
  const communityRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((s, n) => s + n, 0) / ratings.length) * 10) / 10
      : null

  const startIso = prompt.foundersWelcomeSeenAt ?? prompt.firstOpenAt
  let daysTogether = 1
  if (startIso) {
    try {
      daysTogether = Math.max(1, differenceInCalendarDays(new Date(), parseISO(startIso)) + 1)
    } catch {
      daysTogether = 1
    }
  }

  const latest = [...responses].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

  return {
    ideasSubmitted,
    bugsFound,
    featuresAdopted: adoptedFeatures.length,
    communityRating,
    daysTogether,
    recommendWarmth: latest?.recommend ?? null,
    adoptedFeatures,
    empty: responses.length === 0,
  }
}

/** Next unshown thank-you if a Founder’s notes match a shipped slice. */
export async function getPendingFoundersThanks(): Promise<FoundersRememberedThanks | null> {
  const [prompt, responses] = await Promise.all([
    getOrCreatePrompt(),
    db.betaFeedbackResponses.toArray(),
  ])
  if (responses.length === 0) return null

  const seen = new Set(prompt.rememberedThanksSeenIds ?? [])
  const matches = matchShippedFeatures(responses)
  const next = matches.find(m => !seen.has(m.id))
  if (!next) return null

  const feature = SHIPPED_FOUNDERS_FEATURES.find(f => f.id === next.id)
  if (!feature) return null

  return {
    featureId: feature.id,
    title: feature.title,
    thankYou: feature.thankYou,
  }
}

export async function markFoundersThanksSeen(featureId: string): Promise<void> {
  const prompt = await getOrCreatePrompt()
  const seen = new Set(prompt.rememberedThanksSeenIds ?? [])
  seen.add(featureId)
  const now = new Date().toISOString()
  await db.betaFeedbackPrompt.put({
    ...prompt,
    rememberedThanksSeenIds: [...seen],
    updatedAt: now,
  })
}
