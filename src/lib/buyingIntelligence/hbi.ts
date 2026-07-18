import { format } from 'date-fns'
import { db } from '../../db/database'
import hie from '../intelligence/hie'
import { deferNonCritical } from '../deferWork'
import { syncDealAlerts } from './dealHunter'
import { computePriceStats } from './priceHistory'
import { buildSavingsSummary, ensureSavingsFromCoupons, countDuplicatesAvoided } from './savingsAggregator'
import { calculateSavingsScore, scoreLabel } from './savingsScore'
import { buildShoppingRecommendations, splitRecommendations } from './shoppingRecommendations'
import { generateSmartTrip, saveSmartTrip } from './smartTrips'
import {
  getTodaysMission,
  getPersonalDashboardStats,
  getPriorityDeals,
  getShoppingInsights,
  getShoppingListOptimization,
  getKitchenMissionStub,
  getMealsMissionStub,
} from './commandCenterData'
import type { HBIContext, HBISnapshot, MissedOpportunity, SavingsCommandCenter } from './types'

let refreshPromise: Promise<HBISnapshot> | null = null
let lastSnapshot: HBISnapshot | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const listeners = new Set<(snapshot: HBISnapshot) => void>()

export function subscribeHBI(listener: (snapshot: HBISnapshot) => void): () => void {
  listeners.add(listener)
  if (lastSnapshot) listener(lastSnapshot)
  return () => listeners.delete(listener)
}

function notify(snapshot: HBISnapshot) {
  lastSnapshot = snapshot
  for (const fn of listeners) fn(snapshot)
}

export function getCachedHBISnapshot(): HBISnapshot | null {
  return lastSnapshot
}

async function buildCommandCenter(
  savingsSummary: Awaited<ReturnType<typeof buildSavingsSummary>>,
  dealAlerts: Awaited<ReturnType<typeof syncDealAlerts>>,
  recommendations: ReturnType<typeof splitRecommendations>,
  savingsScore: ReturnType<typeof calculateSavingsScore>,
  duplicatesAvoided: number,
): Promise<SavingsCommandCenter> {
  const buyAlerts = dealAlerts.filter(a => a.recommendation === 'buy').slice(0, 3)
  const todayOpportunities = buyAlerts.map(a =>
    `${a.store}: Save $${(a.estimatedSavings ?? 0).toFixed(0)} on ${a.productName}`,
  )

  const skipRec = recommendations.skipList[0]
  const bestDecisionToday = skipRec
    ? { item: skipRec.productName, savings: skipRec.potentialSavings ?? 4.5, action: 'skip' as const }
    : recommendations.buyToday[0]
      ? { item: recommendations.buyToday[0].productName, savings: recommendations.buyToday[0].potentialSavings ?? 0, action: 'buy' as const }
      : undefined

  const storeScores = new Map<string, number>()
  for (const a of dealAlerts.filter(d => d.recommendation === 'buy')) {
    storeScores.set(a.store, (storeScores.get(a.store) ?? 0) + (a.estimatedSavings ?? 0))
  }
  const bestStore = [...storeScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

  const potentialMonthly = recommendations.buyToday.reduce((s, r) => s + (r.potentialSavings ?? 0), 0) * 4

  return {
    todayOpportunities,
    moneySavedThisMonth: savingsSummary.monthTotal,
    foodWastePrevented: savingsSummary.byType['waste-prevented'] ?? 0,
    couponsUsed: savingsSummary.byType.coupon ?? 0,
    duplicatesAvoided,
    bestDecisionToday,
    yearToDateSavings: savingsSummary.yearTotal,
    todaySavings: savingsSummary.todayTotal,
    potentialMonthly,
    bestStore,
    savingsScore: savingsScore.score,
  }
}

function buildBriefingLine(
  commandCenter: SavingsCommandCenter,
  recommendations: ReturnType<typeof splitRecommendations>,
): string {
  const store = commandCenter.bestStore ?? 'your usual store'
  const buy = recommendations.buyToday[0]
  const wait = recommendations.waitList[0]
  const skip = recommendations.skipList[0]
  const savings = recommendations.buyToday.reduce((s, r) => s + (r.potentialSavings ?? 0), 0)

  const parts: string[] = [`I'd lean toward ${store} today.`]
  if (buy) parts.push(`Buy ${buy.productName} while the window is open.`)
  if (wait) parts.push(`Wait on ${wait.productName}.`)
  if (skip) parts.push(`Skip ${skip.productName} for now.`)
  if (savings >= 3) parts.push(`About $${Math.round(savings)} looks possible if you follow the plan.`)
  return parts.join(' ')
}

export async function refreshHBI(ctx: HBIContext = {}): Promise<HBISnapshot> {
  const ref = ctx.reference ?? new Date()
  const month = format(ref, 'yyyy-MM')

  await ensureSavingsFromCoupons()

  const [pantry, grocery, _coupons, recipes, transactions, budgets, priceHistory, lifeProfile] = await Promise.all([
    db.pantryItems.toArray(),
    db.groceryList.toArray(),
    db.coupons.filter(c => !c.used).toArray(),
    db.recipes.toArray(),
    db.transactions.toArray(),
    db.budgets.toArray(),
    db.priceHistory.toArray(),
    db.lifeProfile.toCollection().first(),
  ])

  const preferredStores = ctx.preferredStores ?? lifeProfile?.preferredStores
  const dealAlerts = await syncDealAlerts({ reference: ref, preferredStores })

  const allCoupons = await db.coupons.toArray()
  const savingsSummary = await buildSavingsSummary(ref)
  const duplicatesAvoided = await countDuplicatesAvoided()

  const recommendations = buildShoppingRecommendations(
    pantry, grocery, allCoupons, priceHistory, recipes, { reference: ref, preferredStores },
  )
  const split = splitRecommendations(recommendations)

  const savingsScore = calculateSavingsScore({
    coupons: allCoupons,
    savingsRecords: savingsSummary.records,
    pantry,
    transactions,
    budgets,
    month,
  })

  const commandCenter = await buildCommandCenter(
    savingsSummary, dealAlerts, split, savingsScore, duplicatesAvoided,
  )

  const activeTrips = await db.shoppingTrips.filter(t => !t.completed).toArray()
  if (activeTrips.length === 0 && grocery.some(g => !g.checked)) {
    const trip = await generateSmartTrip(grocery, allCoupons, preferredStores)
    if (trip.stores.length > 0) {
      await saveSmartTrip(trip)
      activeTrips.push({ ...trip, id: undefined })
    }
  }

  const priceStats = computePriceStats(priceHistory, ref)
  const briefingLine = buildBriefingLine(commandCenter, split)

  const snapshot: HBISnapshot = {
    commandCenter,
    recommendations,
    buyToday: split.buyToday,
    waitList: split.waitList,
    skipList: split.skipList,
    dealAlerts,
    activeTrips: await db.shoppingTrips.filter(t => !t.completed).toArray(),
    priceStats: priceStats.slice(0, 50),
    savingsScore,
    briefingLine,
    updatedAt: ref.toISOString(),
  }

  notify(snapshot)
  return snapshot
}

export async function refresh(options?: { trigger?: string; force?: boolean }): Promise<HBISnapshot> {
  if (refreshPromise && !options?.force) return refreshPromise

  refreshPromise = refreshHBI().finally(() => {
    refreshPromise = null
  })

  const snapshot = await refreshPromise

  // Refresh HIE in background — avoid blocking HBI snapshot delivery
  deferNonCritical(() => {
    hie.refreshDebounced({ trigger: options?.trigger ?? 'hbi-refresh', module: 'buying-intelligence' }, 2000)
  })

  return snapshot
}

export function refreshDebounced(options?: { trigger?: string; module?: string }): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    refresh({ trigger: options?.trigger ?? 'debounced' }).catch(console.warn)
  }, 800)
}

export async function findMissedOpportunities(): Promise<MissedOpportunity[]> {
  const [coupons, priceHistory, grocery] = await Promise.all([
    db.coupons.filter(c => !c.used).toArray(),
    db.priceHistory.toArray(),
    db.groceryList.filter(g => !g.checked).toArray(),
  ])

  const opps: MissedOpportunity[] = []

  for (const coupon of coupons.slice(0, 5)) {
    opps.push({
      type: 'unused-coupon',
      title: coupon.title,
      description: `${coupon.store} — expires ${coupon.expirationDate ?? 'soon'}`,
      estimatedMonthly: coupon.discountType === 'fixed' ? coupon.discountValue * 2 : 5,
    })
  }

  const stats = computePriceStats(priceHistory)
  for (const s of stats.filter(st => st.current <= st.lowest * 1.05).slice(0, 3)) {
    opps.push({
      type: 'price-drop',
      title: `${s.productName} at ${s.store}`,
      description: `Lowest in ${s.lowestInDays ?? 'recent'} days — $${s.current.toFixed(2)}`,
      estimatedMonthly: (s.average - s.current) * 4,
    })
  }

  if (grocery.length >= 5) {
    opps.push({
      type: 'bulk-buy',
      title: 'Bulk buy opportunity',
      description: `${grocery.length} list items — consider Costco or Sam's for staples`,
      estimatedMonthly: 15,
    })
  }

  return opps
}

export function getDailySavingsBriefing(snapshot: HBISnapshot): {
  headline: string
  detail: string
  scoreLabel: string
} {
  const store = snapshot.commandCenter.bestStore
  const savings = snapshot.commandCenter.todaySavings
  return {
    headline: store
      ? `I'd start with ${store}${savings >= 3 ? ` — about $${Math.round(savings)} looks possible` : ''}`
      : "I've looked at your house for today",
    detail: snapshot.briefingLine ?? 'Lean on what you have; buy only what earns its place.',
    scoreLabel: scoreLabel(snapshot.savingsScore.score),
  }
}

const hbi = {
  refresh,
  refreshDebounced,
  subscribeHBI,
  getCachedHBISnapshot,
  findMissedOpportunities,
  getDailySavingsBriefing,
  getTodaysMission,
  getPersonalDashboardStats,
  getPriorityDeals,
  getShoppingInsights,
  getShoppingListOptimization,
  getKitchenMissionStub,
  getMealsMissionStub,
}
export default hbi
export type { HBISnapshot, HBIContext } from './types'
