import type {
  Budget,
  Coupon,
  GroceryListItem,
  Meal,
  MealRating,
  PantryItem,
  PriceHistory,
  Receipt,
  ShoppingTrip,
  Transaction,
} from '../../db/database'
import type { HBISnapshot, ShoppingRec } from '../buyingIntelligence/types'
import type { GamePlanCard } from '../householdCommandCenter'

export type SmartCartAction = 'buy' | 'wait' | 'skip'

export interface SmartCartItem {
  productName: string
  action: SmartCartAction
  emoji: '🟢' | '🟡' | '🔴'
  what: string
  why: string
  impact: string
  actionLabel: string
  potentialSavings?: number
  bestStore?: string
  mealUnlocks?: string[]
  aisle?: string
}

export interface TripAisleSection {
  aisle: string
  items: string[]
}

export interface TodaysTrip {
  date: string
  priority: number
  estimatedSpend: number
  estimatedSavings: number
  store: string
  driveMinutes: number
  aisleOrder: TripAisleSection[]
  routeUrl?: string
}

export interface PriceMemoryEntry {
  itemName: string
  store: string
  normalPrice: number
  todayPrice: number
  rating: 'excellent' | 'good' | 'fair' | 'terrible'
  stars: number
  verdict: string
  action: 'buy-extra' | 'buy' | 'wait' | 'skip'
}

export interface PantryDuration {
  itemName: string
  durationLabel: string
  location: string
  expiresSoon?: boolean
  expiresLabel?: string
}

export interface HiddenSavingsCombo {
  id: string
  items: string[]
  sources: string[]
  totalSaved: number
  what: string
  why: string
  impact: string
  actionLabel: string
}

export interface ReceiptInsight {
  itemName: string
  pattern: string
  avgDaysBetween?: number
  lastPurchase?: string
  preferredStore?: string
  what: string
  why: string
  impact: string
  actionLabel: string
}

export interface HouseholdSupplyItem {
  itemName: string
  daysRemaining?: number
  loadsRemaining?: number
  label: string
}

export interface SeasonalDeal {
  id: string
  title: string
  description: string
  savingsPercent?: number
  timing: string
  what: string
  why: string
  impact: string
  actionLabel: string
}

export interface ShoppingMorningBrief {
  greeting: string
  /** Vision V2 page question */
  question?: string
  bullets: string[]
  headline: string
  closingLine?: string
  isDemo: boolean
}

export interface ShoppingCommandCenterStats {
  todaySavings: number
  buyCount: number
  waitCount: number
  skipCount: number
  mealsAvailable: number
  runningLow: number
  expiringSoon: number
  couponsWorth: number
  bestStore: string
  tripSavings?: number
  tripCost?: number
}

export interface StoreComparison {
  store: string
  estimatedTotal: number
  estimatedSavings: number
  itemCount: number
  rank: number
}

export interface ShoppingInsight {
  what: string
  why: string
  impact: string
  actionLabel: string
  route?: string
}

export interface ShoppingIntelligenceBrief {
  computedAt: string
  morningBrief: ShoppingMorningBrief
  /** Shared Game Plan language with Home (COOK / BUY / WAIT / USE / SAVE) */
  gamePlan: GamePlanCard[]
  commandCenter: ShoppingCommandCenterStats
  smartCart: SmartCartItem[]
  todaysTrip: TodaysTrip | null
  priceMemory: PriceMemoryEntry[]
  pantryIntelligence: PantryDuration[]
  hiddenSavings: HiddenSavingsCombo[]
  receiptInsights: ReceiptInsight[]
  householdSupply: HouseholdSupplyItem[]
  seasonalDeals: SeasonalDeal[]
  storeRankings: StoreComparison[]
  topInsights: ShoppingInsight[]
  hbiSnapshot: HBISnapshot
}

export interface ShoppingIntelligenceContext {
  reference?: Date
  displayName?: string
  preferredStores?: string[]
}

export interface ShoppingIntelligenceInputs {
  pantry: PantryItem[]
  groceryList: GroceryListItem[]
  coupons: Coupon[]
  priceHistory: PriceHistory[]
  receipts: Receipt[]
  meals: Meal[]
  mealRatings: MealRating[]
  budgets: Budget[]
  transactions: Transaction[]
  shoppingTrips: ShoppingTrip[]
  hbiSnapshot: HBISnapshot
  reference: Date
  displayName: string
  preferredStores?: string[]
}

export type { ShoppingRec, HBISnapshot }
