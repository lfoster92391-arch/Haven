import { format } from 'date-fns'
import { calculateBudgetStatus } from '../financeCoach'
import { getDailySavingsBriefing } from '../buyingIntelligence/hbi'
import { generateSavingsInsights } from '../savingsInsights'
import type { ShoppingIntelligenceInputs, ShoppingMorningBrief } from './types'
import { countExpiringSoon, countMealsAvailable } from './pantryIntelligence'
import { buildTodaysTrip } from './groceryTripBuilder'
import { db } from '../../db/database'

function timeGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Haven’s daily Savings briefing — “What would you do if you were running my house today?”
 * Calm assistant voice. Never invents demo pantry or deals.
 */
export function buildShoppingMorningBrief(inputs: ShoppingIntelligenceInputs): ShoppingMorningBrief {
  const hour = inputs.reference.getHours()
  const name = inputs.displayName.trim() || 'there'
  const greeting = `${timeGreeting(hour)}, ${name}.`
  const question = 'What would I do if I were running your house today?'
  const bullets: string[] = []

  const meals = countMealsAvailable(inputs)
  if (meals > 0) {
    bullets.push(
      meals === 1
        ? 'You already have enough for one solid dinner — no need to start with the store.'
        : `You already have enough for about ${meals} dinners — lean on the kitchen first.`,
    )
  }

  const expiring = inputs.pantry.filter(p => {
    if (!p.expirationDate) return false
    const d = new Date(p.expirationDate)
    const diff = Math.ceil((d.getTime() - inputs.reference.getTime()) / 86400000)
    return diff >= 0 && diff <= 1
  })
  for (const item of expiring.slice(0, 2)) {
    bullets.push(`I'd use the ${item.name} soon — it looks close.`)
  }

  const buyDeal = inputs.hbiSnapshot.buyToday[0]
  if (buyDeal) {
    const store = buyDeal.bestStore ?? 'your usual store'
    const save =
      buyDeal.potentialSavings && buyDeal.potentialSavings >= 1
        ? ` — roughly $${Math.round(buyDeal.potentialSavings)} in play`
        : ''
    bullets.push(`I'd pick up ${buyDeal.productName} at ${store}${save}.`)
  }

  const waitDeal = inputs.hbiSnapshot.waitList[0]
  if (waitDeal) {
    bullets.push(
      `I'd wait on ${waitDeal.productName}${waitDeal.bestStore ? ` at ${waitDeal.bestStore}` : ''} for now.`,
    )
  }

  const skipDeal = inputs.hbiSnapshot.skipList[0]
  if (skipDeal && bullets.length < 5) {
    bullets.push(`I'd skip ${skipDeal.productName} today — it can wait.`)
  }

  const trip = buildTodaysTrip(inputs)
  if (trip && trip.estimatedSavings >= 3) {
    bullets.push(
      `If you do go out, I'd aim for ~$${Math.round(trip.estimatedSpend)} at ${trip.store} (about $${Math.round(trip.estimatedSavings)} gentler than the usual path).`,
    )
  }

  const month = format(inputs.reference, 'yyyy-MM')
  const budgetStatus = calculateBudgetStatus(inputs.budgets, inputs.transactions, month)
  const grocery = budgetStatus.find(b => b.category === 'Groceries')
  if (grocery?.status === 'over') {
    bullets.push("Groceries are a little tight this month — I'd cook from what you have before buying more.")
  }

  const expiringCount = countExpiringSoon(inputs)
  if (expiringCount > 0 && !bullets.some(b => b.includes('soon') || b.includes('close'))) {
    bullets.push(
      `${expiringCount} thing${expiringCount === 1 ? '' : 's'} in the kitchen should be used soon.`,
    )
  }

  const daily = getDailySavingsBriefing(inputs.hbiSnapshot)
  const storeLine =
    inputs.hbiSnapshot.commandCenter.bestStore &&
    !bullets.some(b => b.includes(inputs.hbiSnapshot.commandCenter.bestStore!))
      ? `I'd lean toward ${inputs.hbiSnapshot.commandCenter.bestStore} if you need a trip.`
      : null
  if (storeLine && bullets.length < 5) bullets.push(storeLine)

  const headline =
    bullets[0] ??
    (daily.headline.includes('start with') || daily.headline.includes('looked')
      ? daily.headline
      : "I've looked things over — nothing urgent is asking for you right now.")

  const closingLine =
    bullets.length >= 2
      ? 'The rest can wait. Take what helps and leave the rest.'
      : meals > 0
        ? 'Your kitchen is in good shape. Enjoy the quiet.'
        : 'When you add pantry items or a short list, I can brief you more clearly.'

  return {
    greeting,
    question,
    headline,
    bullets: bullets.slice(0, 5),
    closingLine,
    isDemo: false,
  }
}

/** Optional async enrichment with savings goals (called from engine). */
export async function enrichMorningBriefWithGoals(
  brief: ShoppingMorningBrief,
  budgets: ShoppingIntelligenceInputs['budgets'],
  transactions: ShoppingIntelligenceInputs['transactions'],
  reference: Date,
): Promise<ShoppingMorningBrief> {
  const goals = await db.savingsGoals.toArray()
  if (goals.length === 0) return brief

  const month = format(reference, 'yyyy-MM')
  const budgetStatus = calculateBudgetStatus(budgets, transactions, month)
  const insights = generateSavingsInsights(budgetStatus, goals)
  const goalLine = insights.find(i => i.type === 'goal' || i.type === 'celebration' || i.type === 'opportunity')
  if (!goalLine) return brief

  const line = `${goalLine.title} — ${goalLine.message.split('.')[0]}.`
  if (brief.bullets.some(b => b.includes(goalLine.title))) return brief

  return {
    ...brief,
    bullets: [...brief.bullets.slice(0, 4), line].slice(0, 5),
  }
}
