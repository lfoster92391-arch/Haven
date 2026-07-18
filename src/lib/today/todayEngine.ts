/**
 * Today Engine — aggregates ONE high-value action per module for the daily inbox.
 * Philosophy: Every module organizes information. Today organizes your day.
 */
import { differenceInDays, format, isSameDay, parseISO, startOfDay } from 'date-fns'
import { db } from '../../db/database'
import { buildShoppingRecommendations, splitRecommendations } from '../buyingIntelligence/shoppingRecommendations'
import { shouldOfferAddToList } from '../shoppingIntelligence/shouldOfferAddToList'
import { getExpiringRecipeMatches } from '../hfip/engines/expirationEngine'
import { buildExpiringPantryTitle, shouldShowAsExpiringPantryCard } from '../pantry/pantryActionVerb'
import { getTodaysFocus } from '../homeHealthEngine'
import { processDecisions } from '../lifeOS/decisionEngine'
import { filterTodayDecisionsByConnections } from '../connections/connectionIntelligence'
import { buildWhyExplanation, mapModuleToEvidenceSources } from '../intelligence/credibilityEngine'
import type { EvidenceSource } from '../intelligence/credibilityTypes'
import type { DecisionItem, IntelligencePriority, Observation } from '../intelligence/types'
import type { TodayDecision, TodayModule, TodayPriority, TodaySnapshot, TodayStats } from './todayTypes'
import { betaSafePath, isBetaFeatureOpen, isBetaLockdownEnabled } from '../betaFeatures'

const MODULE_EVIDENCE: Record<TodayModule, EvidenceSource[]> = {
  shopping: ['purchase-history', 'receipts'],
  pantry: ['pantry'],
  household: ['maintenance-history'],
  wellness: ['manual-entry'],
  budget: ['spending-pattern', 'purchase-history'],
  meals: ['pantry', 'calendar'],
  finance: ['bill-data'],
}

function enrichTodayDecision(decision: TodayDecision): TodayDecision {
  const sources = decision.evidenceSources?.length
    ? decision.evidenceSources
    : MODULE_EVIDENCE[decision.module] ?? mapModuleToEvidenceSources(decision.module)

  return {
    ...decision,
    evidenceSources: sources,
    whyExplanation: decision.whyExplanation ?? buildWhyExplanation(sources, {
      extra: decision.reasons,
    }),
  }
}

const MAX_CARDS = 12
const QUICK_WIN_MINUTES = 10

export interface TodayContext {
  reference?: Date
  waterProgress?: number
  waterGoal?: number
}

function mapIntelPriority(p: IntelligencePriority): TodayPriority {
  if (p === 'critical' || p === 'high') return 'do-today'
  if (p === 'medium') return 'this-week'
  if (p === 'success') return 'completed'
  return 'consider-later'
}

function mapModule(module: string, category?: string): TodayModule {
  if (module === 'buying-intelligence' || category === 'Shopping') return 'shopping'
  if (module === 'kitchen' || module === 'pantry' || category === 'Pantry') return 'pantry'
  if (module === 'household' || category === 'Home' || category === 'Maintenance') return 'household'
  if (module === 'recipes' || category === 'Recipes') return 'meals'
  if (module === 'finance' || category === 'Financial') return 'finance'
  if (module === 'wellness' || category === 'Health') return 'wellness'
  if (category === 'Savings' || category === 'Goals') return 'budget'
  return 'household'
}

function priorityRank(p: TodayPriority): number {
  const order: Record<TodayPriority, number> = {
    'do-today': 0,
    'this-week': 1,
    'consider-later': 2,
    completed: 3,
  }
  return order[p]
}

function sortDecisions(items: TodayDecision[]): TodayDecision[] {
  return [...items].sort((a, b) => {
    const pDiff = priorityRank(a.priority) - priorityRank(b.priority)
    if (pDiff !== 0) return pDiff
    const savingsDiff = (b.savingsAmount ?? 0) - (a.savingsAmount ?? 0)
    if (savingsDiff !== 0) return savingsDiff
    return (b.confidence ?? 0) - (a.confidence ?? 0)
  })
}

function dedupeByModule(items: TodayDecision[]): TodayDecision[] {
  const seen = new Set<TodayModule>()
  const result: TodayDecision[] = []
  for (const item of sortDecisions(items)) {
    if (item.priority === 'completed') {
      result.push(item)
      continue
    }
    if (seen.has(item.module)) continue
    seen.add(item.module)
    result.push(item)
  }
  return result.slice(0, MAX_CARDS)
}

function computeStats(decisions: TodayDecision[]): TodayStats {
  const active = decisions.filter(d => d.priority !== 'completed')
  const highPriority = active.filter(d => d.priority === 'do-today').length
  const quickWins = active.filter(d => d.quickWin).length
  const potentialSavings = active.reduce((s, d) => s + (d.savingsAmount ?? 0), 0)
  const timeMinutes = active.reduce((s, d) => s + (d.timeMinutes ?? 0), 0)
  const count = active.length
  const dayWeight: TodayStats['dayWeight'] =
    count <= 3 ? 'light' : count <= 7 ? 'moderate' : 'heavy'

  return {
    totalDecisions: count,
    highPriority,
    quickWins,
    potentialSavings,
    timeMinutes,
    dayWeight,
  }
}

function hieDecisionToToday(d: DecisionItem): TodayDecision {
  const module = mapModule(d.module, d.category)
  const savings = d.estimatedSavings
  const payload = d.actionPayload ?? {}

  const reasons: string[] = []
  if (d.description) {
    const short = d.description.split('.')[0]?.trim()
    if (short && short.length < 90) reasons.push(short)
  }
  if (savings && savings > 0) {
    reasons.push(`Could save about $${savings.toFixed(0)} a month`)
  }

  return {
    id: d.id,
    module,
    priority: mapIntelPriority(d.priority),
    title: d.title,
    confidence: d.confidence,
    reasons: reasons.slice(0, 4),
    actionLabel: d.actionLabel,
    actionType: d.actionType === 'one-tap' ? 'one-tap' : 'navigate',
    actionPayload: payload,
    actionRoute: d.actionRoute,
    observationId: d.observationId,
    sourceKey: d.sourceKey,
    savingsAmount: savings,
    quickWin: module === 'wellness' || module === 'household',
    metric: savings && savings > 0
      ? { label: 'Save', value: `$${savings.toFixed(2)}` }
      : undefined,
  }
}

async function buildShoppingDecision(ref: Date): Promise<TodayDecision | null> {
  const [pantry, grocery, coupons, priceHistory, recipes] = await Promise.all([
    db.pantryItems.toArray(),
    db.groceryList.toArray(),
    db.coupons.filter(c => !c.used).toArray(),
    db.priceHistory.toArray(),
    db.recipes.toArray(),
  ])

  const recs = buildShoppingRecommendations(pantry, grocery, coupons, priceHistory, recipes, { reference: ref })
  const { buyToday } = splitRecommendations(recs)
  const eligible = buyToday.filter(rec =>
    shouldOfferAddToList(rec.productName, undefined, {
      pantry,
      groceryList: grocery,
      smartCartAction: rec.recommendation,
      context: 'recommendation',
    }).offer,
  )
  const top = eligible[0]
  if (!top) return null

  const reasons: string[] = []
  if (top.mealUnlocks?.length) {
    reasons.push(
      top.mealUnlocks.length === 1
        ? 'Helps unlock a meal this week'
        : `Helps unlock ${top.mealUnlocks.length} meals this week`,
    )
  }
  if (top.priceNote) reasons.push(top.priceNote)
  if (top.potentialSavings && top.potentialSavings > 0) {
    reasons.push(`Could save about $${top.potentialSavings.toFixed(0)}`)
  }
  if (reasons.length === 0 && top.reason) reasons.push(top.reason)

  return {
    id: `today:shopping:${top.productName}`,
    module: 'shopping',
    priority: 'do-today',
    title: `I’d pick up ${top.productName}`,
    subtitle: top.bestStore ? `Looks good at ${top.bestStore}` : undefined,
    confidence: 0.92,
    reasons: reasons.slice(0, 4),
    metric: top.potentialSavings
      ? { label: 'Save', value: `$${top.potentialSavings.toFixed(2)}` }
      : undefined,
    actionLabel: 'Add to my list',
    actionType: 'one-tap',
    actionPayload: { action: 'buyToday', productName: top.productName },
    actionRoute: '/savings',
    savingsAmount: top.potentialSavings,
    quickWin: true,
  }
}

async function buildPantryDecision(ref: Date): Promise<TodayDecision | null> {
  const [pantry, recipes] = await Promise.all([
    db.pantryItems.filter(i => i.quantity > 0).toArray(),
    db.recipes.toArray(),
  ])

  const expiring = pantry
    .filter(i => i.expirationDate && shouldShowAsExpiringPantryCard(i))
    .map(i => ({
      item: i,
      days: differenceInDays(parseISO(i.expirationDate!), ref),
    }))
    .filter(x => x.days >= 0 && x.days <= 2)
    .sort((a, b) => a.days - b.days)

  const topItem = expiring[0]?.item
  if (!topItem) return null

  const matches = getExpiringRecipeMatches(recipes, pantry, ref, 3)
  const bestMatch = matches[0]
  const expiresLabel = expiring[0].days === 0 ? 'Expires today' : expiring[0].days === 1 ? 'Expires tomorrow' : `Expires in ${expiring[0].days} days`
  const wasteValue = 4.19

  const softExpiry =
    expiring[0].days === 0
      ? 'Best used today'
      : expiring[0].days === 1
        ? 'Best used tomorrow'
        : `Best used in the next ${expiring[0].days} days`
  const reasons: string[] = [softExpiry]
  if (bestMatch?.recipe?.name) {
    reasons.push(`${bestMatch.recipe.name} would use it gently`)
  }

  return {
    id: `today:pantry:${topItem.id}`,
    module: 'pantry',
    priority: expiring[0].days <= 1 ? 'do-today' : 'this-week',
    title: buildExpiringPantryTitle(topItem, expiresLabel),
    confidence: 0.95,
    reasons: reasons.slice(0, 4),
    metric: { label: 'Save', value: `$${wasteValue.toFixed(2)}` },
    actionLabel: bestMatch?.recipe ? 'Let’s cook this' : 'See dinner ideas',
    actionType: 'one-tap',
    actionPayload: {
      action: 'cookTonight',
      itemName: topItem.name,
      itemId: topItem.id,
      recipeId: bestMatch?.recipe?.id,
      recipeName: bestMatch?.recipe?.name ?? topItem.name,
      ingredientsUsed: bestMatch?.expiringItems.map(i => i.name),
    },
    actionRoute: bestMatch?.recipe ? `/kitchen?recipe=${bestMatch.recipe.id}` : '/kitchen',
    savingsAmount: wasteValue,
    quickWin: true,
    timeMinutes: 15,
    isDemo: true,
  }
}

async function buildMealsDecision(ref: Date, skipPantry: boolean): Promise<TodayDecision | null> {
  if (skipPantry) return null

  const [pantry, recipes, meals] = await Promise.all([
    db.pantryItems.toArray(),
    db.recipes.toArray(),
    db.meals.toArray(),
  ])

  const todayStr = format(ref, 'yyyy-MM-dd')
  const tonight = meals.find(m => m.day === todayStr && m.mealType === 'dinner')
  if (tonight?.name) {
    return {
      id: `today:meals:${tonight.id}`,
      module: 'meals',
      priority: 'do-today',
      title: `I’d cook ${tonight.name} tonight`,
      reasons: ['Already on your plan', 'You should have what you need'],
      actionLabel: 'Let’s cook this',
      actionType: 'navigate',
      actionPayload: { recipeName: tonight.name },
      actionRoute: '/kitchen',
      quickWin: false,
      timeMinutes: 30,
    }
  }

  const matches = getExpiringRecipeMatches(recipes, pantry, ref, 5)
  if (matches.length === 0) return null
  const match = matches.sort((a, b) => b.expiringItems.length - a.expiringItems.length)[0]
  const useSoon = match.expiringItems[0]?.name

  return {
    id: `today:meals:${match.recipe.id ?? match.recipe.name}`,
    module: 'meals',
    priority: 'this-week',
    title: `I’d cook ${match.recipe.name}`,
    reasons: useSoon
      ? [`It gently uses your ${useSoon.toLowerCase()}`]
      : ['A calm dinner that fits this kitchen'],
    actionLabel: 'Let’s cook this',
    actionType: 'one-tap',
    actionPayload: {
      action: 'cookTonight',
      itemName: match.expiringItems[0]?.name,
      recipeId: match.recipe.id,
      recipeName: match.recipe.name,
      ingredientsUsed: match.expiringItems.map(i => i.name),
    },
    actionRoute: '/kitchen',
    quickWin: false,
    timeMinutes: 25,
  }
}

async function buildHouseholdDecision(ref: Date): Promise<TodayDecision | null> {
  const tasks = await db.householdTasks.toArray()
  const focus = getTodaysFocus(tasks, ref)
  if (!focus) return null

  const primaryTask = focus.tasks[0] ?? `Reset ${focus.zoneName}`
  const title = primaryTask.includes('Vacuum')
    ? `Vacuum ${focus.zoneName} — ${focus.estimatedMinutes} minutes`
    : `${primaryTask} — ${focus.estimatedMinutes} minutes`

  return {
    id: `today:household:${focus.zone}`,
    module: 'household',
    priority: 'do-today',
    title,
    confidence: 0.88,
    reasons: focus.tasks.slice(0, 3).map(t => t),
    metric: { label: 'Time', value: `${focus.estimatedMinutes} min` },
    actionLabel: 'Complete',
    actionType: 'navigate',
    actionRoute: '/household',
    quickWin: focus.estimatedMinutes <= QUICK_WIN_MINUTES,
    timeMinutes: focus.estimatedMinutes,
  }
}

function buildWellnessDecision(waterProgress: number, waterGoal: number): TodayDecision | null {
  if (waterGoal <= 0) return null
  if (waterProgress >= waterGoal * 0.75) return null

  const behind = waterGoal - waterProgress
  return {
    id: 'today:wellness:water',
    module: 'wellness',
    priority: waterProgress < waterGoal * 0.5 ? 'do-today' : 'this-week',
    title: 'Drink Water — You\'re behind today',
    subtitle: `${waterProgress} of ${waterGoal} glasses`,
    confidence: 0.9,
    reasons: [
      `${behind} glass${behind > 1 ? 'es' : ''} to go`,
      'Hydration supports focus',
      'Quick win for your body',
    ],
    actionLabel: 'Done',
    actionType: 'navigate',
    actionRoute: '/wellness',
    quickWin: true,
    timeMinutes: 1,
  }
}

async function buildBudgetDecision(ref: Date): Promise<TodayDecision | null> {
  const [pantry, grocery, coupons, priceHistory, recipes] = await Promise.all([
    db.pantryItems.toArray(),
    db.groceryList.toArray(),
    db.coupons.filter(c => !c.used).toArray(),
    db.priceHistory.toArray(),
    db.recipes.toArray(),
  ])

  const recs = buildShoppingRecommendations(pantry, grocery, coupons, priceHistory, recipes, { reference: ref })
  const { skipList, waitList } = splitRecommendations(recs)
  const top = skipList[0] ?? waitList[0]
  if (!top) return null

  const savings = top.potentialSavings ?? 2.5
  const action = top.recommendation === 'skip' ? 'skipPurchase' : 'wait'

  return {
    id: `today:budget:${top.productName}`,
    module: 'budget',
    priority: 'consider-later',
    title: `${top.recommendation === 'skip' ? 'Skip buying' : 'Wait on'} ${top.productName}`,
    subtitle: top.recommendation === 'wait' ? 'Price drop expected' : undefined,
    confidence: 0.85,
    reasons: [top.reason, top.stockNote ?? 'Already stocked'].filter(Boolean).slice(0, 4) as string[],
    metric: { label: 'Save', value: `$${savings.toFixed(2)}` },
    actionLabel: 'Why?',
    actionType: 'one-tap',
    actionPayload: { action, productName: top.productName, sourceKey: `budget:${top.productName}` },
    actionRoute: '/savings',
    savingsAmount: savings,
    quickWin: true,
  }
}

async function buildFinanceDecision(ref: Date): Promise<TodayDecision | null> {
  const bills = await db.bills.filter(b => !b.paid).toArray()
  const today = startOfDay(ref)

  const dueToday = bills.filter(b => {
    if (!b.dueDate) return false
    return isSameDay(parseISO(b.dueDate), today)
  })

  const bill = dueToday[0]
  if (!bill) return null

  return {
    id: `today:finance:${bill.id}`,
    module: 'finance',
    priority: 'do-today',
    title: `${bill.name} is due today`,
    confidence: 0.99,
    reasons: [`About $${bill.amount.toFixed(0)} — I’ll keep it simple`],
    metric: { label: 'Amount', value: `$${bill.amount.toFixed(2)}` },
    actionLabel: 'Take care of this',
    actionType: 'one-tap',
    actionPayload: { action: 'payBill', billId: bill.id },
    actionRoute: '/finance',
    savingsAmount: 0,
    quickWin: true,
    timeMinutes: 2,
  }
}

function enhanceFromHIE(
  moduleDecisions: TodayDecision[],
  hieDecisions: TodayDecision[],
): TodayDecision[] {
  const moduleSet = new Set(moduleDecisions.map(d => d.module))
  const extras = hieDecisions.filter(
    d => !moduleSet.has(d.module) && d.priority !== 'completed',
  )
  return [...moduleDecisions, ...extras]
}

/** Aggregate today's decisions — max one primary card per module, capped at 12. */
export async function aggregateTodayDecisions(
  observations: Observation[],
  context: TodayContext = {},
): Promise<TodaySnapshot> {
  const ref = context.reference ?? new Date()
  const waterProgress = context.waterProgress ?? 0
  const waterGoal = context.waterGoal ?? 8

  const processed = processDecisions(observations)
  const hieToday = processed.map(hieDecisionToToday)
  const completed = hieToday.filter(d => d.priority === 'completed')

  const [
    shopping,
    pantry,
    household,
    wellness,
    budget,
    finance,
  ] = await Promise.all([
    buildShoppingDecision(ref),
    buildPantryDecision(ref),
    isBetaLockdownEnabled() ? Promise.resolve(null) : buildHouseholdDecision(ref),
    isBetaLockdownEnabled()
      ? Promise.resolve(null)
      : Promise.resolve(buildWellnessDecision(waterProgress, waterGoal)),
    buildBudgetDecision(ref),
    buildFinanceDecision(ref),
  ])

  const meals = await buildMealsDecision(ref, !!pantry)

  const moduleBuilt = [shopping, pantry, meals, household, wellness, budget, finance].filter(
    (d): d is TodayDecision => d != null,
  )

  const merged = enhanceFromHIE(moduleBuilt, hieToday.filter(d => d.priority !== 'completed'))
  let decisions = dedupeByModule([...merged, ...completed.slice(0, 3)])

  const deliveries = await db.connectedDeliveries.toArray()
  decisions = filterTodayDecisionsByConnections(decisions, deliveries)
  decisions = decisions
    .map(d => {
      if (!d.actionRoute) return d
      const safe = betaSafePath(d.actionRoute)
      return safe && safe !== d.actionRoute ? { ...d, actionRoute: safe } : d
    })
    .filter(d => !d.actionRoute || isBetaFeatureOpen(d.actionRoute))
  decisions = decisions.map(enrichTodayDecision)

  return {
    decisions,
    stats: computeStats(decisions),
  }
}

export function groupTodayByPriority(
  decisions: TodayDecision[],
): Record<TodayPriority, TodayDecision[]> {
  const groups: Record<TodayPriority, TodayDecision[]> = {
    'do-today': [],
    'this-week': [],
    'consider-later': [],
    completed: [],
  }
  for (const d of decisions) {
    groups[d.priority].push(d)
  }
  return groups
}
