import { db } from '../../db/database'
import hbi from '../buyingIntelligence/hbi'
import { deferNonCritical } from '../deferWork'
import { buildHiddenSavings, estimateCouponsWorth } from './couponStackingAI'
import { buildTodaysTrip } from './groceryTripBuilder'
import { buildHouseholdSupplyForecast } from './householdSupplyForecast'
import { buildPantryIntelligence, countExpiringSoon, countMealsAvailable, countRunningLow } from './pantryIntelligence'
import { buildPriceMemory } from './priceMemory'
import { buildReceiptInsights, persistPurchasePatterns } from './receiptBrain'
import { buildSeasonalDeals } from './seasonalShoppingBrain'
import { buildShoppingMorningBrief, enrichMorningBriefWithGoals } from './shoppingMorningBrief'
import { buildSavingsGamePlan } from './savingsGamePlan'
import { buildSmartCart } from './smartCart'
import { buildStoreRankings, pickBestStore } from './storeOptimizer'
import type {
  ShoppingCommandCenterStats,
  ShoppingInsight,
  ShoppingIntelligenceBrief,
  ShoppingIntelligenceContext,
  ShoppingIntelligenceInputs,
} from './types'

let refreshPromise: Promise<ShoppingIntelligenceBrief> | null = null
let lastBrief: ShoppingIntelligenceBrief | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const listeners = new Set<(brief: ShoppingIntelligenceBrief) => void>()

export function subscribeShoppingIntelligence(listener: (brief: ShoppingIntelligenceBrief) => void): () => void {
  listeners.add(listener)
  if (lastBrief) listener(lastBrief)
  return () => listeners.delete(listener)
}

export function getCachedShoppingBrief(): ShoppingIntelligenceBrief | null {
  return lastBrief
}

function notify(brief: ShoppingIntelligenceBrief) {
  lastBrief = brief
  for (const fn of listeners) fn(brief)
}

function buildCommandCenterStats(
  inputs: ShoppingIntelligenceInputs,
  trip: ReturnType<typeof buildTodaysTrip>,
): ShoppingCommandCenterStats {
  const smartCart = buildSmartCart(inputs)
  const cc = inputs.hbiSnapshot.commandCenter
  const best = pickBestStore(inputs)

  return {
    todaySavings: cc.todaySavings || trip?.estimatedSavings || 0,
    buyCount: smartCart.filter(i => i.action === 'buy').length,
    waitCount: smartCart.filter(i => i.action === 'wait').length,
    skipCount: smartCart.filter(i => i.action === 'skip').length,
    mealsAvailable: countMealsAvailable(inputs),
    runningLow: countRunningLow(inputs),
    expiringSoon: countExpiringSoon(inputs),
    couponsWorth: estimateCouponsWorth(inputs),
    bestStore: best.store,
    tripSavings: trip?.estimatedSavings,
    tripCost: trip?.estimatedSpend,
  }
}

function buildTopInsights(inputs: ShoppingIntelligenceInputs, stats: ShoppingCommandCenterStats): ShoppingInsight[] {
  const insights: ShoppingInsight[] = []

  if (stats.expiringSoon > 0) {
    insights.push({
      what: `${stats.expiringSoon} items expiring soon`,
      why: 'Use pantry items before they spoil',
      impact: 'Prevent waste and save a grocery run',
      actionLabel: 'See pantry',
      route: '/kitchen',
    })
  }

  const topBuy = inputs.hbiSnapshot.buyToday[0]
  if (topBuy) {
    insights.push({
      what: `Buy ${topBuy.productName} today`,
      why: topBuy.reason,
      impact: topBuy.potentialSavings ? `Save ~$${topBuy.potentialSavings.toFixed(2)}` : 'Best price window',
      actionLabel: 'Add to trip',
      route: '/savings?tab=smart-cart',
    })
  }

  const topSkip = inputs.hbiSnapshot.skipList[0]
  if (topSkip) {
    insights.push({
      what: `Skip ${topSkip.productName}`,
      why: topSkip.reason,
      impact: 'Keep grocery spend down',
      actionLabel: 'Remove from list',
      route: '/savings?tab=smart-cart',
    })
  }

  if (stats.couponsWorth > 10) {
    insights.push({
      what: `$${stats.couponsWorth.toFixed(0)} in hidden savings`,
      why: 'Coupons match items on your list',
      impact: 'Stack at checkout for max savings',
      actionLabel: 'View combos',
      route: '/savings?tab=hidden-savings',
    })
  }

  return insights.slice(0, 4)
}

async function loadInputs(ctx: ShoppingIntelligenceContext): Promise<ShoppingIntelligenceInputs> {
  const reference = ctx.reference ?? new Date()
  const hbiSnapshot = await hbi.refresh({ trigger: 'hsie', force: false })

  const [
    pantry, groceryList, coupons, priceHistory, receipts, meals,
    mealRatings, budgets, transactions, shoppingTrips, lifeProfile, userProfile,
  ] = await Promise.all([
    db.pantryItems.toArray(),
    db.groceryList.toArray(),
    db.coupons.filter(c => !c.used).toArray(),
    db.priceHistory.toArray(),
    db.receipts.toArray(),
    db.meals.toArray(),
    db.mealRatings.toArray(),
    db.budgets.toArray(),
    db.transactions.toArray(),
    db.shoppingTrips.toArray(),
    db.lifeProfile.toCollection().first(),
    db.userProfile.toCollection().first(),
  ])

  return {
    pantry,
    groceryList,
    coupons,
    priceHistory,
    receipts,
    meals,
    mealRatings,
    budgets,
    transactions,
    shoppingTrips,
    hbiSnapshot,
    reference,
    displayName: ctx.displayName ?? userProfile?.name ?? 'there',
    preferredStores: ctx.preferredStores ?? lifeProfile?.preferredStores,
  }
}

export async function runShoppingIntelligenceBrief(
  ctx: ShoppingIntelligenceContext = {},
): Promise<ShoppingIntelligenceBrief> {
  const inputs = await loadInputs(ctx)
  const computedAt = inputs.reference.toISOString()

  const smartCart = buildSmartCart(inputs)
  const todaysTrip = buildTodaysTrip(inputs)
  const priceMemory = buildPriceMemory(inputs)
  const pantryIntelligence = buildPantryIntelligence(inputs)
  const hiddenSavings = buildHiddenSavings(inputs)
  const receiptInsights = buildReceiptInsights(inputs)
  const householdSupply = buildHouseholdSupplyForecast(inputs)
  const seasonalDeals = buildSeasonalDeals(inputs)
  const storeRankings = await buildStoreRankings(inputs)
  let morningBrief = buildShoppingMorningBrief(inputs)
  morningBrief = await enrichMorningBriefWithGoals(
    morningBrief,
    inputs.budgets,
    inputs.transactions,
    inputs.reference,
  )
  const gamePlan = buildSavingsGamePlan(inputs)
  const commandCenter = buildCommandCenterStats(inputs, todaysTrip)
  const topInsights = buildTopInsights(inputs, commandCenter)

  const brief: ShoppingIntelligenceBrief = {
    computedAt,
    morningBrief,
    gamePlan,
    commandCenter,
    smartCart,
    todaysTrip,
    priceMemory,
    pantryIntelligence,
    hiddenSavings,
    receiptInsights,
    householdSupply,
    seasonalDeals,
    storeRankings,
    topInsights,
    hbiSnapshot: inputs.hbiSnapshot,
  }

  notify(brief)

  deferNonCritical(() => {
    persistPurchasePatterns(receiptInsights, db).catch(console.warn)
    cacheBrief(brief, todaysTrip).catch(console.warn)
  })

  return brief
}

async function cacheBrief(brief: ShoppingIntelligenceBrief, trip: ReturnType<typeof buildTodaysTrip>): Promise<void> {
  const id = 'latest'
  const existing = await db.shoppingIntelligenceCache.get(id)
  const row = { id, computedAt: brief.computedAt, brief }
  if (existing) await db.shoppingIntelligenceCache.put(row)
  else await db.shoppingIntelligenceCache.add(row)

  if (trip) {
    await db.tripPlans.put({
      id: trip.date,
      date: trip.date,
      store: trip.store,
      items: trip.aisleOrder.flatMap(a => a.items),
      estimatedCost: trip.estimatedSpend,
      savings: trip.estimatedSavings,
      computedAt: brief.computedAt,
    })
  }

  for (const pm of brief.priceMemory.slice(0, 20)) {
    const key = `${pm.itemName}::${pm.store}`
    await db.priceMemory.put({
      id: key,
      itemName: pm.itemName,
      store: pm.store,
      price: pm.todayPrice,
      normalPrice: pm.normalPrice,
      recordedAt: brief.computedAt,
    })
  }

  for (const hs of brief.householdSupply) {
    const key = hs.itemName.toLowerCase()
    await db.householdSupply.put({
      id: key,
      itemName: hs.itemName,
      daysRemaining: hs.daysRemaining,
      loadsRemaining: hs.loadsRemaining,
      label: hs.label,
      updatedAt: brief.computedAt,
    })
  }

  for (const ri of brief.receiptInsights) {
    const key = ri.itemName.toLowerCase()
    await db.receiptLearnings.put({
      id: key,
      itemName: ri.itemName,
      pattern: ri.pattern,
      avgDaysBetween: ri.avgDaysBetween,
      lastPurchase: ri.lastPurchase,
      preferredStore: ri.preferredStore,
      updatedAt: brief.computedAt,
    })
  }
}

export async function refreshShoppingIntelligence(options?: { trigger?: string; force?: boolean }): Promise<ShoppingIntelligenceBrief> {
  if (refreshPromise && !options?.force) return refreshPromise

  refreshPromise = runShoppingIntelligenceBrief().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

export function refreshShoppingIntelligenceDebounced(options?: { trigger?: string }): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    refreshShoppingIntelligence({ trigger: options?.trigger ?? 'debounced' }).catch(console.warn)
  }, 800)
}

export async function loadCachedBriefFromDb(): Promise<ShoppingIntelligenceBrief | null> {
  const cached = await db.shoppingIntelligenceCache.get('latest')
  if (cached?.brief) {
    lastBrief = cached.brief as ShoppingIntelligenceBrief
    return lastBrief
  }
  return null
}

const hsie = {
  runShoppingIntelligenceBrief,
  refresh: refreshShoppingIntelligence,
  refreshDebounced: refreshShoppingIntelligenceDebounced,
  subscribe: subscribeShoppingIntelligence,
  getCached: getCachedShoppingBrief,
  loadCachedBriefFromDb,
}

export default hsie
