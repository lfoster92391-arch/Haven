import {
  endOfMonth,
  format,
  getDayOfYear,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns'
import { db } from '../db/database'
import { buildSavingsSummary } from './buyingIntelligence/savingsAggregator'
import { displayRecipeName } from './mealLearning'

export interface HavenMemory {
  id: string
  /** First person / Haven voice — “Last October you made…” */
  line: string
  whisper?: string
  weight: number
}

/**
 * Personal Haven Memories — not social, not a feed.
 * Quiet proof that Haven understands this household’s life.
 */
export async function gatherHavenMemories(reference = new Date()): Promise<HavenMemory[]> {
  const memories: HavenMemory[] = []

  const [mealEntries, savings, prompt] = await Promise.all([
    db.mealLearning.toArray(),
    buildSavingsSummary(reference),
    db.betaFeedbackPrompt.get('default'),
  ])

  const totalCooks = mealEntries.reduce((s, e) => s + (e.cookCount || 0), 0)
  if (totalCooks >= 3) {
    memories.push({
      id: 'cooks-total',
      line:
        totalCooks === 1
          ? 'You’ve cooked at home once with Haven watching over the kitchen.'
          : `You’ve cooked at home ${totalCooks} times — real meals, not just takeout.`,
      whisper: 'I’ll keep remembering the ones you love.',
      weight: 40 + Math.min(totalCooks, 40),
    })
  }

  // Busiest recent month of cooking
  const monthBuckets = new Map<string, number>()
  for (const entry of mealEntries) {
    if (!entry.lastCookedAt || !entry.cookCount) continue
    try {
      const key = format(parseISO(entry.lastCookedAt), 'yyyy-MM')
      monthBuckets.set(key, (monthBuckets.get(key) ?? 0) + 1)
    } catch {
      /* skip bad dates */
    }
  }
  // Also approximate from cookCount spread: look at last 6 calendar months via lastCookedAt presence
  let bestMonth: { key: string; count: number } | null = null
  for (let i = 1; i <= 6; i++) {
    const d = subMonths(reference, i)
    const key = format(d, 'yyyy-MM')
    const start = startOfMonth(d).toISOString()
    const end = endOfMonth(d).toISOString()
    const count = mealEntries.filter(
      e => e.lastCookedAt && e.lastCookedAt >= start && e.lastCookedAt <= end && e.cookCount > 0,
    ).length
    const cooked = mealEntries
      .filter(e => e.lastCookedAt && e.lastCookedAt >= start && e.lastCookedAt <= end)
      .reduce((s, e) => s + Math.min(e.cookCount, 3), 0)
    const score = Math.max(count, cooked, monthBuckets.get(key) ?? 0)
    if (score >= 2 && (!bestMonth || score > bestMonth.count)) {
      bestMonth = { key, count: score }
    }
  }
  if (bestMonth) {
    const label = format(parseISO(`${bestMonth.key}-01`), 'MMMM')
    memories.push({
      id: `cooks-month-${bestMonth.key}`,
      line: `Last ${label} you cooked at home ${bestMonth.count} time${bestMonth.count === 1 ? '' : 's'}.`,
      whisper: 'Those nights still count.',
      weight: 55 + bestMonth.count * 4,
    })
  }

  const favorite = [...mealEntries]
    .filter(e => e.cookCount >= 2)
    .sort((a, b) => b.cookCount - a.cookCount || (b.isFavorite === a.isFavorite ? 0 : b.isFavorite ? 1 : -1))[0]
  if (favorite) {
    const name = displayRecipeName(favorite)
    memories.push({
      id: `favorite-${favorite.recipeKey}`,
      line:
        favorite.cookCount >= 4
          ? `${name} is becoming a family favorite — cooked ${favorite.cookCount} times.`
          : `You’ve reached for ${name} more than once. I’ll keep it close.`,
      whisper: favorite.personalName ? 'Your version.' : undefined,
      weight: 50 + favorite.cookCount * 5 + (favorite.isFavorite ? 15 : 0),
    })
  }

  const evolved = mealEntries.find(
    e => (e.defaultAdditions?.length ?? 0) > 0 || (e.defaultRemovals?.length ?? 0) > 0,
  )
  if (evolved) {
    const name = displayRecipeName(evolved)
    const add = evolved.defaultAdditions?.[0]
    const remove = evolved.defaultRemovals?.[0]
    const detail = add
      ? `usually includes ${add}`
      : remove
        ? `usually skips ${remove}`
        : 'has your fingerprints on it'
    memories.push({
      id: `version-${evolved.recipeKey}`,
      line: `I’ll remember — ${name} ${detail}.`,
      whisper: 'Recipes should feel like home.',
      weight: 62,
    })
  }

  if (savings.yearTotal >= 40) {
    memories.push({
      id: 'savings-year',
      line: `You’ve saved about $${Math.round(savings.yearTotal).toLocaleString()} with Haven this year.`,
      whisper: 'Quiet wins add up.',
      weight: 48 + Math.min(Math.round(savings.yearTotal / 10), 40),
    })
  } else if (savings.monthTotal >= 15) {
    memories.push({
      id: 'savings-month',
      line: `This month you’ve already saved about $${Math.round(savings.monthTotal).toLocaleString()}.`,
      whisper: 'I’m proud of how carefully you’re looking after things.',
      weight: 45,
    })
  }

  const startIso = prompt?.foundersWelcomeSeenAt ?? prompt?.firstOpenAt
  if (startIso) {
    try {
      const days = Math.max(
        1,
        Math.floor((reference.getTime() - parseISO(startIso).getTime()) / 86_400_000) + 1,
      )
      if (days >= 7) {
        memories.push({
          id: 'days-together',
          line:
            days === 1
              ? 'Today is our first day looking after this home together.'
              : `We’ve been looking after this home together for ${days} days.`,
          whisper: 'Thank you for trusting Haven.',
          weight: 35 + Math.min(days, 30),
        })
      }
    } catch {
      /* ignore */
    }
  }

  return memories.sort((a, b) => b.weight - a.weight)
}

/** One featured memory for the day — stable rotation, not random flicker. */
export function pickFeaturedMemory(
  memories: HavenMemory[],
  reference = new Date(),
): HavenMemory | null {
  if (memories.length === 0) return null
  const top = memories.slice(0, Math.min(5, memories.length))
  const idx = getDayOfYear(reference) % top.length
  return top[idx] ?? top[0]
}

export function emptyHavenMemoryLine(): HavenMemory {
  return {
    id: 'empty',
    line: 'I’m still getting to know your home.',
    whisper: 'As we cook, save, and learn together, memories will gather here — just for you.',
    weight: 0,
  }
}
