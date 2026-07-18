import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useMemo, useEffect } from 'react'
import { useScrollToTopOnChange } from '../hooks/useScrollToTopOnChange'
import { format, differenceInCalendarDays, parseISO } from 'date-fns'
import { type PantryItem } from '../db/database'
import {
  usePantryItems,
  useGroceryList,
  useMeals,
  useCoupons,
  useRecipes,
  useInventoryEvents,
  useUserProfile,
} from '../hooks/useHavenData'
import { generateShoppingRecommendations, getExpirationSummary } from '../lib/shoppingAdvisor'
import { addToGroceryList as persistGroceryItem } from '../lib/shoppingIntelligence/groceryListService'
import { shouldOfferAddToList } from '../lib/shoppingIntelligence/shouldOfferAddToList'
import { guessPantryCategory, guessPantryLocation, isLikelySpice } from '../lib/pantryAutomation'
import {
  buildScanDefaults,
  confidenceBadge,
  estimateShelfLifeFromPurchase,
  resolvePurchaseDate,
  type PurchaseTiming,
} from '../lib/shelfLifeEstimates'
import { buildKitchenDashboard } from '../lib/kitchenEngine'
import { generateKitchenAdvice, buildKitchenDecisions } from '../lib/kitchenAdvisor'
import { buildInventoryTimeline } from '../lib/inventoryTimeline'
import { buildWasteSummary, predictRefillDates } from '../lib/usageLearning'
import { MEAL_CATEGORY_TABS, generateWeeklyPlan, calculatePantryValue } from '../lib/mealEngine'
import { useMissionControl } from '../hooks/useMissionControl'
import { useMealRecommendations } from '../hooks/useMealRecommendations'
import { KitchenMissionControl } from '../components/KitchenMissionControl'
import { MealRecommendationCard } from '../components/MealRecommendationCard'
import { MealPlanList } from '../components/MealPlanList'
import { RecipeDetail, matchToViewData } from '../components/RecipeDetail'
import type { MealMatch } from '../lib/mealEngine'
import {
  addPantryItem,
  applyBatchAction,
  deletePantryItem,
  type BatchAction,
} from '../lib/inventoryService'
import { CouponScanner, type ScanResult } from '../components/CouponScanner'
import { tourRoute } from '../lib/havenVision/roomTour'
import { VirtualKitchen } from '../components/virtualKitchen'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { CompactCard } from '../components/ui/CompactCard'
import { SectionToggle } from '../components/ui/SectionToggle'
import { ActionMenu } from '../components/ui/ActionMenu'
import { ResponsiveTabs } from '../components/ui/MobileTabSelect'
import { TabContentSkeleton } from '../components/ui/PageSkeleton'
import { useDeferredWork } from '../hooks/useDeferredWork'
import { FilterDropdown } from '../components/ui/FilterDropdown'
import { useHBISnapshot } from '../hooks/useHBI'
import { KitchenAssistantHero } from '../components/kitchen/KitchenAssistantHero'
import { UseFirstSection } from '../components/kitchen/UseFirstSection'
import { NextShoppingSection } from '../components/kitchen/NextShoppingSection'
import { BiggestSavingsCard } from '../components/kitchen/BiggestSavingsCard'
import { RunningLowPanel } from '../components/kitchen/RunningLowPanel'
import { KitchenCommandCenter } from '../components/pantry/KitchenCommandCenter'
import { ReceiptScanner, ReceiptReview, type ReceiptScanResult, type ReceiptSaveData } from '../components/ReceiptScanner'
import { BETA_BANNER_COPY, isBetaSimplifiedUi } from '../lib/betaFeatures'
import {
  generateKitchenSummary,
  getOutcomeStats,
  getUseFirstItems,
  getNextShoppingTrip,
  groupRunningLowByCategory,
} from '../lib/kitchenSummary'
import styles from './Kitchen.module.css'
import listStyles from './ModulePage.module.css'

type PantryLocation = PantryItem['location']
type KitchenTab =
  | 'dashboard'
  | 'command'
  | 'inventory'
  | 'expiration'
  | 'timeline'
  | 'advisor'
  | 'waste'
  | 'shopping'
  | 'decisions'
  | 'planner'

const KITCHEN_TABS: { id: KitchenTab; label: string; question?: string }[] = [
  { id: 'dashboard', label: 'Dashboard', question: "How's my kitchen?" },
  { id: 'inventory', label: 'Kitchen', question: "What's inside?" },
  { id: 'expiration', label: 'Expiration', question: 'What expires first?' },
  { id: 'timeline', label: 'Notes' },
  { id: 'advisor', label: 'Advisor' },
  { id: 'waste', label: 'Food Waste' },
  { id: 'shopping', label: 'Shopping', question: 'What should I buy?' },
  { id: 'decisions', label: 'Decisions' },
  { id: 'planner', label: 'Meal Planner', question: 'What should I cook this week?' },
]

/** Beta: dinner + expiring + shopping — demote dense command chrome tabs. */
const BETA_KITCHEN_TABS: { id: KitchenTab; label: string; question?: string }[] = [
  { id: 'dashboard', label: 'Tonight', question: 'What should I cook?' },
  { id: 'expiration', label: 'Expiring', question: 'What should I use first?' },
  { id: 'shopping', label: 'Shopping', question: 'What should I buy?' },
  { id: 'inventory', label: 'Kitchen', question: "What's inside?" },
  { id: 'planner', label: 'Meals', question: 'What should I cook this week?' },
]

const PANTRY_TABS: { id: KitchenTab; label: string; question?: string }[] = [
  { id: 'command', label: 'Command Center', question: 'What should I do next?' },
  { id: 'inventory', label: 'Kitchen', question: "What's inside?" },
  { id: 'expiration', label: 'Expiration', question: 'What expires first?' },
  { id: 'shopping', label: 'Shopping', question: 'What should I buy?' },
]

const BETA_PANTRY_TABS: { id: KitchenTab; label: string; question?: string }[] = [
  { id: 'command', label: 'Tonight', question: 'Dinner, expiring food, shopping.' },
  { id: 'expiration', label: 'Expiring', question: 'What should I use first?' },
  { id: 'shopping', label: 'Shopping', question: 'What should I buy?' },
  { id: 'inventory', label: 'Kitchen', question: "What's inside?" },
]

function areaToLocationFilter(area: string | null): string {
  const map: Record<string, string> = {
    fridge: 'fridge',
    freezer: 'freezer',
    pantry: 'pantry',
    spices: 'spice',
    spice: 'spice',
  }
  return area && map[area] ? map[area] : 'all'
}

const INVENTORY_LOCATIONS: { id: string; label: string; filter: (i: PantryItem) => boolean }[] = [
  { id: 'all', label: 'All', filter: () => true },
  { id: 'fridge', label: '🧊 Refrigerator', filter: i => i.location === 'fridge' },
  { id: 'freezer', label: '❄️ Freezer', filter: i => i.location === 'freezer' },
  { id: 'pantry', label: '🏠 Pantry Shelves', filter: i => i.location === 'pantry' },
  { id: 'spice', label: '🧂 Spices', filter: i => i.location === 'spice' },
  { id: 'baking', label: '🥖 Baking', filter: i => i.location === 'baking' || i.category === 'Baking' },
  { id: 'snacks', label: '🍿 Snacks', filter: i => i.location === 'snacks' || i.category === 'Snacks' },
  { id: 'drinks', label: '🥤 Drinks', filter: i => i.location === 'drinks' || i.category === 'Beverages' },
  { id: 'pet-food', label: '🐾 Pet Food', filter: i => i.location === 'pet-food' },
]

interface PendingScan {
  name: string
  barcode: string
  location: PantryLocation
  category: string
  brand?: string
  packageSize?: string
  expirationHint: string
  expirationIsEstimate: boolean
  expirationConfidence: PantryItem['expirationConfidence']
  shelfLifeDays?: number
}

interface ExpirationGroup {
  key: string
  label: string
  items: PantryItem[]
}

function groupExpirations(items: PantryItem[]): ExpirationGroup[] {
  const now = new Date()
  const groups: ExpirationGroup[] = [
    { key: 'expired', label: '🔴 Expired', items: [] },
    { key: 'today', label: 'Today', items: [] },
    { key: 'tomorrow', label: 'Tomorrow', items: [] },
    { key: '3days', label: '3 Days', items: [] },
    { key: '7days', label: '7 Days', items: [] },
    { key: '14days', label: '14 Days', items: [] },
    { key: '30days', label: '30 Days', items: [] },
  ]

  for (const item of items) {
    if (!item.expirationDate || item.quantity <= 0) continue
    const days = differenceInCalendarDays(parseISO(item.expirationDate), now)
    if (days < 0) groups[0].items.push(item)
    else if (days === 0) groups[1].items.push(item)
    else if (days === 1) groups[2].items.push(item)
    else if (days <= 3) groups[3].items.push(item)
    else if (days <= 7) groups[4].items.push(item)
    else if (days <= 14) groups[5].items.push(item)
    else if (days <= 30) groups[6].items.push(item)
  }
  return groups.filter(g => g.items.length > 0)
}

export function Kitchen({ mode = 'kitchen' }: { mode?: 'kitchen' | 'pantry' }) {
  const isPantryMode = mode === 'pantry'
  const beta = isBetaSimplifiedUi()
  const kitchenTabs = isPantryMode
    ? (beta ? BETA_PANTRY_TABS : PANTRY_TABS)
    : (beta ? BETA_KITCHEN_TABS : KITCHEN_TABS)
  const navigate = useNavigate()
  const profile = useUserProfile()
  const items = usePantryItems()
  const events = useInventoryEvents(200)
  const groceryList = useGroceryList()
  const meals = useMeals()
  const coupons = useCoupons(true)
  const recipes = useRecipes()
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState<KitchenTab>(isPantryMode ? 'command' : 'dashboard')
  const [tabSwitching, setTabSwitching] = useState(false)
  useScrollToTopOnChange(tab)
  const [inventoryView, setInventoryView] = useState<'virtual' | 'list'>(() =>
    isPantryMode && searchParams.get('view') === 'list' ? 'list' : 'virtual',
  )
  const [locationFilter, setLocationFilter] = useState(() => areaToLocationFilter(searchParams.get('area')))
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [location, setLocation] = useState<PantryLocation>('pantry')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('item')
  const [expiration, setExpiration] = useState('')
  const [category, setCategory] = useState('General')
  const [showScanner, setShowScanner] = useState(false)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [scannedBarcode, setScannedBarcode] = useState('')
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null)
  const [scanQty, setScanQty] = useState('1')
  const [scanUnit, setScanUnit] = useState('item')
  const [scanExpiration, setScanExpiration] = useState('')
  const [purchaseTiming, setPurchaseTiming] = useState<PurchaseTiming>('today')
  const [purchaseCustomDate, setPurchaseCustomDate] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [refillPredictions, setRefillPredictions] = useState<Awaited<ReturnType<typeof predictRefillDates>>>([])
  const [adviceList, setAdviceList] = useState<Awaited<ReturnType<typeof generateKitchenAdvice>>>([])
  const [viewingMatch, setViewingMatch] = useState<MealMatch | null>(null)
  const [mealCategory] = useState<(typeof MEAL_CATEGORY_TABS)[number]['id']>('tonight')
  const [showReceiptScanner, setShowReceiptScanner] = useState(false)
  const [receiptReview, setReceiptReview] = useState<ReceiptScanResult | null>(null)

  const needsMissionData = tab === 'dashboard' || (isPantryMode && tab === 'command')
  const needsMealRankings = needsMissionData || tab === 'planner'

  const { mission } = useMissionControl({ enabled: needsMissionData })
  const hbi = useHBISnapshot()
  const { recommendations: rankedMeals, diverseTonight, feedbackByRecipeId } = useMealRecommendations({
    categoryFilter: mealCategory,
    enabled: needsMealRankings,
  })

  useEffect(() => {
    const allowedTabs = kitchenTabs
    const t = searchParams.get('tab') as KitchenTab | null
    if (t && allowedTabs.some(x => x.id === t)) {
      setTab(t)
    } else if (isPantryMode) {
      const area = searchParams.get('area')
      setTab(area ? 'inventory' : 'command')
    }

    if (isPantryMode) {
      setInventoryView(searchParams.get('view') === 'list' ? 'list' : 'virtual')
      setLocationFilter(areaToLocationFilter(searchParams.get('area')))
    }
  }, [searchParams, isPantryMode, kitchenTabs, beta])

  // Deep-link: /kitchen?recipe=123 opens recipe detail when data is ready
  useEffect(() => {
    const recipeIdParam = searchParams.get('recipe')
    if (!recipeIdParam || !recipes?.length) return
    const id = Number(recipeIdParam)
    if (!Number.isFinite(id)) return

    const fromRanked = rankedMeals.find(m => m.recipeId === id)
    if (fromRanked) {
      setViewingMatch(fromRanked)
      return
    }

    const recipe = recipes.find(r => r.id === id)
    if (!recipe) return
    setViewingMatch({
      id: `recipe-${id}`,
      name: recipe.name,
      mealType: recipe.mealType,
      category: recipe.category ?? ('dinner' as MealMatch['category']),
      score: 1,
      rankScore: 1,
      stars: 3,
      canMake: true,
      haveIngredients: recipe.ingredients ?? [],
      haveSpices: recipe.spices ?? [],
      missingIngredients: [],
      missingSpices: [],
      useSoonItems: [],
      pantryOnly: false,
      shoppingRequired: 0,
      builtin: false,
      recipeId: recipe.id,
      directions: recipe.directions,
      imageData: recipe.imageData,
      prepTimeMinutes: recipe.prepTimeMinutes,
      cookTimeMinutes: recipe.cookMinutes,
      servings: recipe.servings,
      notes: recipe.notes,
      wastePrevented: 0,
      pantryItemCount: 0,
      purchaseCount: 0,
      substitutedIngredients: [],
      mealCategories: [],
      learningBoost: 0,
      couponEligible: [],
      ingredientMatches: [],
    })
  }, [searchParams, recipes, rankedMeals])

  function updatePantryParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams)
    mutate(params)
    if (params.get('tab') === 'command') params.delete('tab')
    setSearchParams(params, { replace: true })
  }

  function switchTab(t: KitchenTab) {
    if (t !== tab) setTabSwitching(true)
    setTab(t)
    if (isPantryMode) {
      updatePantryParams(params => {
        if (t === 'command') {
          params.delete('tab')
          params.delete('area')
          params.delete('view')
        } else if (t === 'inventory') {
          params.set('tab', 'inventory')
        } else {
          params.set('tab', t)
          params.delete('area')
          params.delete('view')
        }
      })
    } else {
      setSearchParams(t === 'dashboard' ? {} : { tab: t }, { replace: true })
    }
  }

  function setInventoryViewMode(v: 'virtual' | 'list') {
    setInventoryView(v)
    if (isPantryMode) {
      updatePantryParams(params => {
        if (v === 'list') params.set('view', 'list')
        else params.delete('view')
      })
    }
  }

  const foodItems = useMemo(() => items?.filter(i => i.location !== 'spice') ?? [], [items])
  const spiceItems = useMemo(() => items?.filter(i => i.location === 'spice') ?? [], [items])
  const allItems = items ?? []

  const expSummary = useMemo(() => getExpirationSummary(foodItems), [foodItems])

  const needsDashboardBundle = tab === 'dashboard' || (isPantryMode && tab === 'command')
  const needsShoppingData = tab === 'shopping' || tab === 'dashboard'
  const needsDeferredTab =
    needsDashboardBundle ||
    needsShoppingData ||
    tab === 'expiration' ||
    tab === 'timeline' ||
    tab === 'advisor' ||
    tab === 'waste' ||
    tab === 'decisions' ||
    tab === 'planner'

  const { value: derived, ready: derivedReady } = useDeferredWork(() => {
    const recipesList = recipes ?? []
    const grocery = groceryList ?? []
    const mealsList = meals ?? []
    const couponsList = coupons ?? []

    const dashboard = (needsDashboardBundle || tab === 'waste')
      ? buildKitchenDashboard(allItems, recipesList, grocery, mealsList, couponsList)
      : null

    const recommendations = needsShoppingData
      ? generateShoppingRecommendations(foodItems, grocery, mealsList, couponsList)
      : []

    const outcomeStats = needsDashboardBundle
      ? getOutcomeStats(allItems, recipesList, mealsList, grocery, couponsList, hbi)
      : null

    const kitchenSummary = needsDashboardBundle
      ? generateKitchenSummary(allItems, mealsList, recipesList, {
          groceryList: grocery,
          coupons: couponsList,
          hbi,
        })
      : null

    const runningLowCategories = needsDashboardBundle
      ? groupRunningLowByCategory(allItems)
      : []

    const useFirstItems = needsDashboardBundle ? getUseFirstItems(allItems, 3) : []

    const nextShoppingTrip = needsDashboardBundle
      ? getNextShoppingTrip(allItems, { hbi, recommendations, limit: 5 })
      : { headline: '', items: [], estimatedTotal: 0 }

    const pantryValue = needsDashboardBundle ? calculatePantryValue(allItems) : 0

    const expirationGroups = tab === 'expiration' ? groupExpirations(allItems) : []

    const timeline = tab === 'timeline'
      ? buildInventoryTimeline(events ?? [], allItems)
      : []

    const wasteSummary = tab === 'waste' ? buildWasteSummary(allItems) : null

    const weeklyPlan = tab === 'planner'
      ? generateWeeklyPlan(allItems, recipesList)
      : null

    const decisions = (needsDashboardBundle || tab === 'decisions')
      ? buildKitchenDecisions(adviceList)
      : []

    const cookTonightMeals = needsDashboardBundle
      ? (diverseTonight.length > 0
        ? diverseTonight
        : (() => {
            const ready = rankedMeals.filter(m => m.canMake)
            return (ready.length > 0 ? ready : rankedMeals).slice(0, 8)
          })())
      : []

    return {
      dashboard,
      recommendations,
      outcomeStats,
      kitchenSummary,
      runningLowCategories,
      useFirstItems,
      nextShoppingTrip,
      pantryValue,
      expirationGroups,
      timeline,
      wasteSummary,
      weeklyPlan,
      decisions,
      cookTonightMeals,
    }
  }, [
    tab,
    isPantryMode,
    allItems,
    foodItems,
    recipes,
    groceryList,
    meals,
    coupons,
    events,
    hbi,
    adviceList,
    rankedMeals,
    diverseTonight,
    needsDashboardBundle,
    needsShoppingData,
  ])

  useEffect(() => {
    if (derivedReady) setTabSwitching(false)
  }, [derivedReady, tab])

  useEffect(() => {
    if (tab !== 'advisor' && tab !== 'dashboard' && !(isPantryMode && tab === 'command')) return
    predictRefillDates(foodItems).then(setRefillPredictions)
    generateKitchenAdvice(allItems, recipes ?? [], groceryList ?? []).then(setAdviceList)
  }, [tab, isPantryMode, allItems, recipes, groceryList, foodItems])

  const dashboard = derived?.dashboard
  const recommendations = derived?.recommendations ?? []
  const outcomeStats = derived?.outcomeStats
  const kitchenSummary = derived?.kitchenSummary
  const runningLowCategories = derived?.runningLowCategories ?? []
  const useFirstItems = derived?.useFirstItems ?? []
  const nextShoppingTrip = derived?.nextShoppingTrip ?? { headline: '', items: [], estimatedTotal: 0 }
  const pantryValue = derived?.pantryValue ?? 0
  const expirationGroups = derived?.expirationGroups ?? []
  const timeline = derived?.timeline ?? []
  const wasteSummary = derived?.wasteSummary
  const weeklyPlan = derived?.weeklyPlan
  const decisions = derived?.decisions ?? []
  const cookTonightMeals = derived?.cookTonightMeals ?? []
  const tonightPrimary =
    mission?.tonightBest ??
    dashboard?.recommendedDinner ??
    dashboard?.topRecipe ??
    cookTonightMeals[0] ??
    null
  const tonightMoreIdeas = cookTonightMeals.filter(meal => {
    if (!tonightPrimary) return true
    if (cookTonightMeals.length === 1) return true
    return meal.id !== tonightPrimary.id
  })

  const showTabSkeleton = (tabSwitching || (needsDeferredTab && !derivedReady)) && tab !== 'inventory'

  const activeTabMeta = kitchenTabs.find(t => t.id === tab)

  const locationDef = INVENTORY_LOCATIONS.find(l => l.id === locationFilter) ?? INVENTORY_LOCATIONS[0]
  const filteredInventory = allItems.filter(locationDef.filter)

  const needToBuy = recommendations.filter(r => !r.alreadyHave && r.reason !== 'expiring-soon')

  function exploreStorageArea(areaId: string) {
    const area = areaId === 'spices' ? 'spices' : areaId
    switchTab('inventory')
    setInventoryView('virtual')
    setLocationFilter(areaToLocationFilter(area))
    updatePantryParams(params => {
      params.set('tab', 'inventory')
      params.set('area', area)
      params.delete('view')
    })
  }

  function exploreVirtualKitchen() {
    switchTab('inventory')
    setInventoryView('virtual')
    updatePantryParams(params => {
      params.set('tab', 'inventory')
      params.delete('area')
      params.delete('view')
    })
  }

  function reviewPantry() {
    if (expSummary.expired > 0 || expSummary.useSoon > 0) {
      switchTab('expiration')
    } else {
      exploreVirtualKitchen()
    }
  }

  async function savePantryReceipt(data: ReceiptSaveData) {
    const routed = data.routedItems ?? []
    const pantryItems = routed
      .filter(i => i.destination === 'pantry' && i.pantryLocation)
      .map(i => ({
        name: i.name,
        location: i.pantryLocation!,
        category: i.pantryCategory ?? 'General',
      }))

    for (const item of pantryItems) {
      await addPantryItem({
        name: item.name,
        location: item.location,
        category: item.category,
        quantity: 1,
        unit: 'item',
        expirationConfidence: 'unknown',
      })
    }

    setReceiptReview(null)
    setScanMessage(
      pantryItems.length > 0
        ? `I’ve updated your kitchen with ${pantryItems.length} item${pantryItems.length === 1 ? '' : 's'} from that receipt.`
        : 'I’ve looked at that receipt — nothing new to add right now.',
    )
  }

  function openAddForm(loc: PantryLocation = 'pantry') {
    setLocation(loc)
    setCategory(loc === 'spice' ? 'Spices' : 'General')
    setShowForm(true)
  }

  function openScanner(forSpice = false) {
    setLocation(forSpice ? 'spice' : 'pantry')
    setShowScanner(true)
  }

  async function handleScan(result: ScanResult) {
    setShowScanner(false)
    if (result.type !== 'barcode' || !result.barcode) return

    const scanLocation: PantryLocation = location === 'spice' ? 'spice' : guessPantryLocation(result.product?.name ?? '')
    const finalLocation: PantryLocation = isLikelySpice(result.product?.name ?? '') ? 'spice' : scanLocation

    if (result.product) {
      const cat = finalLocation === 'spice' ? 'Spices' : guessPantryCategory(result.product.name)
      const defaults = buildScanDefaults(result.product, finalLocation, cat)
      setPendingScan({
        name: result.product.name,
        barcode: result.barcode,
        location: finalLocation,
        category: cat,
        brand: result.product.brand,
        packageSize: result.product.packageSize,
        expirationHint: defaults.expirationHint,
        expirationIsEstimate: defaults.expirationIsEstimate,
        expirationConfidence: defaults.expirationConfidence,
        shelfLifeDays: defaults.shelfLifeDays,
      })
      setScanQty(String(defaults.quantity))
      setScanUnit(defaults.unit)
      setPurchaseTiming('today')
      applyPurchaseDate('today', result.product.name, finalLocation, result.product.categories ?? [])
      setScanMessage(null)
    } else {
      setScannedBarcode(result.barcode)
      setName('')
      setLocation(finalLocation)
      setCategory(finalLocation === 'spice' ? 'Spices' : 'General')
      setShowForm(true)
      setScanMessage(`I found barcode ${result.barcode} — what should I call this?`)
    }
  }

  function applyPurchaseDate(timing: PurchaseTiming, itemName: string, loc: PantryLocation, categories: string[] = []) {
    setPurchaseTiming(timing)
    const purchaseDate = resolvePurchaseDate(timing, purchaseCustomDate)
    const est = estimateShelfLifeFromPurchase(itemName, purchaseDate, categories, loc)
    setScanExpiration(est.expirationDate)
    if (pendingScan) {
      setPendingScan({
        ...pendingScan,
        expirationHint: est.hint,
        expirationIsEstimate: timing !== 'pick-date',
        expirationConfidence: timing === 'pick-date' ? 'verified' : 'estimated',
        shelfLifeDays: est.shelfLifeDays,
      })
    }
  }

  useEffect(() => {
    if (pendingScan) {
      applyPurchaseDate(purchaseTiming, pendingScan.name, pendingScan.location)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseTiming, purchaseCustomDate])

  async function confirmScan(e: React.FormEvent) {
    e.preventDefault()
    if (!pendingScan) return
    const purchaseDate = resolvePurchaseDate(purchaseTiming, purchaseCustomDate)
    await addPantryItem({
      name: pendingScan.name,
      location: pendingScan.location,
      category: pendingScan.category,
      quantity: parseInt(scanQty) || 1,
      unit: scanUnit,
      expirationDate: scanExpiration || undefined,
      expirationConfidence: pendingScan.expirationConfidence,
      purchaseDate,
      barcode: pendingScan.barcode,
      brand: pendingScan.brand,
      packageSize: pendingScan.packageSize,
      shelfLifeDays: pendingScan.shelfLifeDays,
    })
    setPendingScan(null)
    setScanMessage(`I’ve added ${pendingScan.name} to your kitchen.`)
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await addPantryItem({
      name: name.trim(),
      location,
      category,
      quantity: parseInt(quantity) || 1,
      unit,
      expirationDate: expiration || undefined,
      expirationConfidence: expiration ? 'verified' : 'unknown',
      barcode: scannedBarcode || undefined,
    })
    setName('')
    setQuantity('1')
    setExpiration('')
    setScannedBarcode('')
    setShowForm(false)
    setScanMessage(`I’ve added ${name.trim()} to your kitchen.`)
  }

  async function addToGroceryList(itemName: string) {
    const offer = shouldOfferAddToList(itemName, undefined, {
      pantry: allItems,
      groceryList: groceryList ?? [],
      context: 'recommendation',
    })
    if (!offer.offer) {
      setScanMessage(offer.skipReason ?? 'I think you already have this covered.')
      return
    }
    const result = await persistGroceryItem(itemName, { category: 'From Kitchen' })
    setScanMessage(result.added ? `I’ll remember that — ${result.message}` : result.message)
  }

  function toggleSelect(id?: number) {
    if (!id) return
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function runBatch(action: BatchAction) {
    if (selectedIds.length === 0) return
    await applyBatchAction(selectedIds, action, { extendDays: 3 })
    setSelectedIds([])
    setScanMessage(`I’ll remember that.`)
  }

  return (
    <div className={listStyles.page}>
      <PageHeader
        icon={isPantryMode ? '🌿' : '🍳'}
        title={beta ? 'Kitchen' : isPantryMode ? 'Kitchen Command Center' : 'Kitchen'}
        subtitle={beta ? 'What should I cook?' : isPantryMode ? 'What do I have?' : 'What should I cook?'}
      />

      {beta && (
        <p className={listStyles.alertBanner} role="status" style={{ opacity: 0.9 }}>
          {BETA_BANNER_COPY}
        </p>
      )}

      {scanMessage && <div className={listStyles.alertBanner}>{scanMessage}</div>}

      {(expSummary.useSoon > 0 || expSummary.expired > 0) && tab !== 'expiration' && tab !== 'command' && (
        <div className={listStyles.alertBanner}>
          {expSummary.expired > 0 && `${expSummary.expired} expired · `}
          {expSummary.useSoon > 0 && `${expSummary.useSoon} expiring within 7 days — `}
          <button type="button" className={styles.linkBtn} onClick={() => switchTab('expiration')}>
            {beta ? 'Use first →' : 'Open Expiration Center'}
          </button>
        </div>
      )}

      {!(isPantryMode && tab === 'command') && !beta && (
        <div className={listStyles.statGrid}>
          <CompactCard value={`🧊 ${foodItems.filter(i => i.location === 'fridge').length}`} label="Fridge" />
          <CompactCard value={`❄️ ${foodItems.filter(i => i.location === 'freezer').length}`} label="Freezer" />
          <CompactCard value={`🏠 ${foodItems.filter(i => i.location === 'pantry').length}`} label="Shelves" />
          <CompactCard value={`🧂 ${spiceItems.length}`} label="Spices" />
          {needToBuy.length > 0 && (
            <CompactCard value={needToBuy.length} label="To buy" alert />
          )}
        </div>
      )}

      <ResponsiveTabs
        tabs={kitchenTabs.map(t => ({ id: t.id, label: t.label }))}
        active={tab}
        onChange={switchTab}
        pending={showTabSkeleton}
        mobileLabel={isPantryMode ? 'Pantry section' : 'Kitchen section'}
        ariaLabel={isPantryMode ? 'Pantry sections' : 'Kitchen sections'}
        tabsClassName={styles.tabs}
        tabClassName={styles.tab}
        tabActiveClassName={styles.tabActive}
      />

      {activeTabMeta?.question && (
        <p className={styles.tabQuestion}>{activeTabMeta.question}</p>
      )}

      {!(isPantryMode && tab === 'command') && (
        <div className={listStyles.actions}>
          <div className={listStyles.actionRowPrimary}>
            <Button size="sm" onClick={() => openScanner(locationFilter === 'spice')}>📷 Scan</Button>
            <Button size="sm" onClick={() => openAddForm(locationFilter === 'spice' ? 'spice' : 'pantry')}>
              {showForm ? 'Cancel' : '+ Add Item'}
            </Button>
            <ActionMenu
              label="More"
              items={[
                { label: 'Recipes', icon: '🍽️', onClick: () => switchTab('planner') },
                { label: 'Smart Shopping', icon: '🏷️', href: '/savings' },
                ...(isPantryMode
                  ? [{ label: 'Full Kitchen', icon: '🍳', href: '/kitchen' }]
                  : [
                      { label: 'Expiration', icon: '⏰', onClick: () => switchTab('expiration') },
                      ...(!beta
                        ? [
                            { label: 'Kitchen Advisor', icon: '✦', onClick: () => switchTab('advisor') },
                            { label: 'Decisions', icon: '⚡', onClick: () => switchTab('decisions') },
                          ]
                        : []),
                    ]),
              ]}
            />
          </div>
        </div>
      )}

      {pendingScan && (
        <Card title="Confirm scanned item">
          <form onSubmit={confirmScan} className={listStyles.form}>
            <p className={styles.barcodeNote}>Barcode: {pendingScan.barcode}</p>
            {pendingScan.brand && <p className={styles.scanMeta}>Brand: {pendingScan.brand}</p>}
            {pendingScan.packageSize && <p className={styles.scanMeta}>Package: {pendingScan.packageSize}</p>}
            <input
              className={listStyles.input}
              value={pendingScan.name}
              onChange={e => setPendingScan({ ...pendingScan, name: e.target.value })}
              required
            />
            <p className={styles.scanMeta}>When did you purchase this?</p>
            <div className={styles.purchaseQuestion}>
              {(['today', 'yesterday', 'pick-date', 'estimated'] as PurchaseTiming[]).map(t => (
                <button
                  key={t}
                  type="button"
                  className={`${styles.purchaseBtn} ${purchaseTiming === t ? styles.purchaseBtnActive : ''}`}
                  onClick={() => setPurchaseTiming(t)}
                >
                  {t === 'today' ? 'Today' : t === 'yesterday' ? 'Yesterday' : t === 'pick-date' ? 'Pick Date' : 'Estimated'}
                </button>
              ))}
            </div>
            {purchaseTiming === 'pick-date' && (
              <input
                className={listStyles.input}
                type="date"
                value={purchaseCustomDate}
                onChange={e => setPurchaseCustomDate(e.target.value)}
              />
            )}
            <div className={listStyles.formRow}>
              <input className={listStyles.input} type="number" min="1" placeholder="Quantity" value={scanQty} onChange={e => setScanQty(e.target.value)} />
              <input className={listStyles.input} placeholder="Unit" value={scanUnit} onChange={e => setScanUnit(e.target.value)} />
              <input className={listStyles.input} type="date" value={scanExpiration} onChange={e => setScanExpiration(e.target.value)} title="Expiration" />
              <span className={listStyles.badge}>
                {confidenceBadge(pendingScan.expirationConfidence).emoji}{' '}
                {confidenceBadge(pendingScan.expirationConfidence).label}
              </span>
            </div>
            {pendingScan.expirationHint && (
              <p className={styles.expiryEstimate}>📅 {pendingScan.expirationHint}</p>
            )}
            <div className={listStyles.formRow}>
              <Button type="submit">Add to Kitchen</Button>
              <Button type="button" variant="ghost" onClick={() => setPendingScan(null)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {showForm && (
        <Card>
          <form onSubmit={addItem} className={listStyles.form}>
            {scannedBarcode && <p className={styles.barcodeNote}>Barcode: {scannedBarcode}</p>}
            <input className={listStyles.input} placeholder={location === 'spice' ? 'Spice name' : 'Item name'} value={name} onChange={e => setName(e.target.value)} required />
            <div className={listStyles.formRow}>
              <select className={listStyles.select} value={location} onChange={e => setLocation(e.target.value as PantryLocation)}>
                <option value="pantry">Pantry</option>
                <option value="fridge">Refrigerator</option>
                <option value="freezer">Freezer</option>
                <option value="spice">Spices</option>
                <option value="baking">Baking</option>
                <option value="snacks">Snacks</option>
                <option value="drinks">Drinks</option>
                <option value="pet-food">Pet Food</option>
              </select>
              <input className={listStyles.input} type="number" min="0" placeholder="Qty" value={quantity} onChange={e => setQuantity(e.target.value)} />
              <input className={listStyles.input} placeholder="Unit" value={unit} onChange={e => setUnit(e.target.value)} />
              <input className={listStyles.input} type="date" value={expiration} onChange={e => setExpiration(e.target.value)} title="Expiration date" />
              <select className={listStyles.select} value={category} onChange={e => setCategory(e.target.value)}>
                {(location === 'spice'
                  ? ['Spices', 'Herbs', 'Seasoning Blends', 'Salts', 'Peppers']
                  : ['General', 'Dairy', 'Produce', 'Meat', 'Frozen', 'Beverages', 'Snacks', 'Baking', 'Canned']
                ).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <Button type="submit">Add</Button>
            </div>
          </form>
        </Card>
      )}

      {showTabSkeleton && <TabContentSkeleton />}

      {!showTabSkeleton && tab === 'command' && isPantryMode && dashboard && outcomeStats && kitchenSummary && (
        <KitchenCommandCenter
          items={allItems}
          dashboard={dashboard}
          outcomes={outcomeStats}
          kitchenSummary={kitchenSummary}
          mission={mission}
          expiredCount={expSummary.expired}
          pantryValue={pantryValue}
          groceryList={groceryList ?? []}
          rankedMeals={rankedMeals}
          tonightOptions={diverseTonight}
          adviceList={adviceList}
          userName={profile?.name}
          onReviewPantry={reviewPantry}
          onOpenShopping={() => switchTab('shopping')}
          onOpenMeals={() => switchTab('planner')}
          onSelectMeal={m => setViewingMatch(m)}
          onAddItem={() => openAddForm()}
          onScan={() => navigate(tourRoute())}
          onImportReceipt={() => setShowReceiptScanner(true)}
          onMoveItem={() => {
            switchTab('inventory')
            setInventoryView('list')
          }}
          onCreateShoppingList={() => switchTab('shopping')}
          onExploreArea={exploreStorageArea}
          onExploreVirtual={exploreVirtualKitchen}
        />
      )}

      {!showTabSkeleton && tab === 'dashboard' && dashboard && outcomeStats && kitchenSummary && (
        <>
          {!beta && mission && (
            <KitchenMissionControl
              mission={mission}
              onSelectMeal={m => setViewingMatch(m)}
            />
          )}

          <KitchenAssistantHero
            userName={profile?.name}
            primary={tonightPrimary}
            moreCount={cookTonightMeals.length}
            useSoonCount={expSummary.useSoon}
            onCook={m => setViewingMatch(m)}
            onSeeMore={() => switchTab('planner')}
          />

          {tonightMoreIdeas.length > 0 && (
            <SectionToggle
              title={tonightPrimary ? 'More ideas for tonight' : 'Cook Tonight'}
              summary={
                tonightPrimary
                  ? `${tonightMoreIdeas.length} more when you’re ready`
                  : 'Ready when you are'
              }
              defaultExpanded
              collapsible={false}
            >
              <div className={styles.mealRecGrid}>
                {tonightMoreIdeas.map(meal => (
                  <MealRecommendationCard
                    key={meal.id}
                    match={meal}
                    compact
                    showActions
                    onClick={() => setViewingMatch(meal)}
                  />
                ))}
              </div>
              <button type="button" className={styles.sectionLink} onClick={() => switchTab('planner')}>
                See all meals →
              </button>
            </SectionToggle>
          )}

          <UseFirstSection
            items={useFirstItems}
            onViewAll={() => switchTab('expiration')}
          />

          <NextShoppingSection
            headline={nextShoppingTrip.headline}
            items={nextShoppingTrip.items}
            estimatedTotal={nextShoppingTrip.estimatedTotal}
            onViewAll={() => switchTab('shopping')}
          />

          {!beta && (
            <BiggestSavingsCard
              outcomes={outcomeStats}
              onAction={() => switchTab('shopping')}
            />
          )}

          {runningLowCategories.length > 0 && (
            <RunningLowPanel
              categories={runningLowCategories}
              summary={kitchenSummary}
              showSummary={!beta}
            />
          )}

          <SectionToggle title="Quick actions" summary="Jump to tools" defaultExpanded={false}>
            <div className={styles.quickActions}>
              <button type="button" className={styles.quickAction} onClick={() => switchTab('expiration')}>⏰ Expiration</button>
              <button type="button" className={styles.quickAction} onClick={() => switchTab('shopping')}>🛒 Shopping</button>
              {!beta && (
                <>
                  <button type="button" className={styles.quickAction} onClick={() => switchTab('advisor')}>✦ Advisor</button>
                  <button type="button" className={styles.quickAction} onClick={() => switchTab('decisions')}>⚡ Decisions</button>
                </>
              )}
              <button type="button" className={styles.quickAction} onClick={() => switchTab('planner')}>
                🍽️ Meals
              </button>
            </div>
          </SectionToggle>

          {!beta && adviceList.length > 0 && (
            <SectionToggle
              title="Kitchen Advisor"
              summary={`${adviceList.length} tip${adviceList.length === 1 ? '' : 's'}`}
              count={adviceList.length}
              defaultExpanded={false}
            >
              {adviceList.slice(0, 3).map(tip => (
                <div key={tip.id} className={styles.advisorCard}>
                  <strong>{tip.icon} {tip.title}</strong>
                  <p className={styles.recMessage}>{tip.message}</p>
                  {tip.tab && (
                    <Button size="sm" variant="secondary" onClick={() => switchTab(tip.tab as KitchenTab)}>{tip.action ?? 'View'}</Button>
                  )}
                </div>
              ))}
              <button type="button" className={styles.linkBtn} onClick={() => switchTab('advisor')}>See all advisor tips →</button>
            </SectionToggle>
          )}

          {!beta && decisions.length > 0 && (
            <SectionToggle
              title="Decisions"
              summary={`${decisions.length} action${decisions.length === 1 ? '' : 's'}`}
              count={decisions.length}
              defaultExpanded={false}
            >
              <div className={styles.decisionGrid}>
                {decisions.slice(0, 4).map(d => (
                  <button
                    key={d.id}
                    type="button"
                    className={styles.decisionBtn}
                    onClick={() => {
                      if (d.tab) switchTab(d.tab as KitchenTab)
                      else if (d.route.startsWith('/kitchen')) switchTab('dashboard')
                      else navigate(d.route)
                    }}
                  >
                    <span className={styles.decisionIcon}>{d.icon}</span>
                    <span className={styles.decisionLabel}>{d.label}</span>
                  </button>
                ))}
              </div>
              <button type="button" className={styles.linkBtn} onClick={() => switchTab('decisions')}>Open Decision Center →</button>
            </SectionToggle>
          )}
        </>
      )}

      {tab === 'inventory' && (
        <>
          <FilterDropdown
            label="Location"
            mobileOnly
            value={locationFilter}
            onChange={setLocationFilter}
            options={INVENTORY_LOCATIONS.map(loc => ({ id: loc.id, label: loc.label }))}
          />
          <div className={`${styles.inventorySubTabs} ${styles.filterDesktop}`}>
            {INVENTORY_LOCATIONS.map(loc => (
              <button
                key={loc.id}
                type="button"
                className={`${styles.subTab} ${locationFilter === loc.id ? styles.subTabActive : ''}`}
                onClick={() => setLocationFilter(loc.id)}
              >
                {loc.label}
              </button>
            ))}
          </div>
          <FilterDropdown
            label="View"
            mobileOnly
            value={inventoryView}
            onChange={v => setInventoryViewMode(v as 'virtual' | 'list')}
            options={[
              { id: 'virtual', label: '🏡 Explore' },
              { id: 'list', label: '📋 List View' },
            ]}
          />
          <div className={`${styles.inventorySubTabs} ${styles.filterDesktop}`}>
            <button type="button" className={`${styles.subTab} ${inventoryView === 'virtual' ? styles.subTabActive : ''}`} onClick={() => setInventoryViewMode('virtual')}>🏡 Explore</button>
            <button type="button" className={`${styles.subTab} ${inventoryView === 'list' ? styles.subTabActive : ''}`} onClick={() => setInventoryViewMode('list')}>📋 List View</button>
          </div>

          {inventoryView === 'virtual' && (
            <Card title={isPantryMode ? 'Explore your pantry' : 'Virtual Kitchen'}>
              {!allItems.length ? (
                <p className={listStyles.empty}>Add a few things and I’ll help you explore the fridge, pantry, and more.</p>
              ) : (
                <VirtualKitchen
                  items={allItems}
                  recipes={recipes ?? []}
                  coupons={coupons ?? []}
                  initialArea={isPantryMode ? searchParams.get('area') : null}
                />
              )}
            </Card>
          )}

          {inventoryView === 'list' && (
            <>
              {locationFilter === 'all' && runningLowCategories.length > 0 && kitchenSummary && (
                <RunningLowPanel
                  categories={runningLowCategories}
                  summary={kitchenSummary}
                  showSummary={false}
                />
              )}
              <Card title="In your kitchen">
                {filteredInventory.length === 0 ? (
                  <p className={listStyles.empty}>Nothing here yet — want to add something?</p>
                ) : (
                  <ul className={listStyles.list}>
                    {filteredInventory.map(item => {
                      const badge = confidenceBadge(item.expirationConfidence)
                      const isLow = item.quantity <= item.lowStockThreshold
                      return (
                        <li key={item.id} className={`${listStyles.listItem} ${isLow ? listStyles.lowStock : ''}`}>
                          {isLow && <span className={styles.listDot} aria-hidden>🟡</span>}
                          <span className={listStyles.itemName}>{item.location === 'spice' ? '🧂 ' : ''}{item.name}</span>
                          <div className={listStyles.itemMeta}>
                            <span className={listStyles.badge}>{item.location}</span>
                            <span>{item.quantity} {item.unit}</span>
                            {item.expirationDate && (
                              <span className={listStyles.badge}>Exp. {format(parseISO(item.expirationDate), 'MMM d')}</span>
                            )}
                            <span className={styles.confidenceBadge}>{badge.emoji} {badge.label}</span>
                            <button className={listStyles.deleteBtn} onClick={() => item.id && deletePantryItem(item.id)}>×</button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </Card>
            </>
          )}

          {locationFilter === 'spice' && (
            <div className={styles.spiceSection}>
              <Card title="Spice Rack">
                <p className={styles.spiceIntro}>Scan or add spices. Haven checks them when suggesting meals.</p>
              </Card>
            </div>
          )}
        </>
      )}

      {!showTabSkeleton && tab === 'expiration' && (
        <>
          {selectedIds.length > 0 && (
            <div className={styles.batchBar}>
              <span>{selectedIds.length} selected</span>
              <Button size="sm" onClick={() => runBatch('mark-used')}>Mark Used</Button>
              <ActionMenu
                label="Batch actions"
                items={[
                  { label: 'Freeze', icon: '❄️', onClick: () => runBatch('freeze') },
                  { label: 'Throw Away', icon: '🗑️', onClick: () => runBatch('discard') },
                  { label: 'Donate', icon: '💚', onClick: () => runBatch('donate') },
                  { label: 'Extend Date', icon: '📅', onClick: () => runBatch('extend-date') },
                ]}
              />
            </div>
          )}
          {expirationGroups.length === 0 ? (
            <Card><p className={listStyles.empty}>Nothing expiring in the next 30 days.</p></Card>
          ) : (
            expirationGroups.map(group => (
              <div key={group.key} className={styles.expirationGroup}>
                <h3 className={styles.groupHeader}>{group.label} ({group.items.length})</h3>
                <ul className={listStyles.list}>
                  {group.items.map(item => (
                    <li key={item.id} className={listStyles.listItem}>
                      <input
                        type="checkbox"
                        checked={item.id ? selectedIds.includes(item.id) : false}
                        onChange={() => toggleSelect(item.id)}
                      />
                      <span className={listStyles.itemName}>{item.name}</span>
                      <div className={listStyles.itemMeta}>
                        <span>{item.quantity} {item.unit}</span>
                        {item.expirationDate && (
                          <span className={listStyles.badge}>{format(parseISO(item.expirationDate), 'MMM d')}</span>
                        )}
                        <span className={listStyles.badge}>{item.location}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </>
      )}

      {!showTabSkeleton && tab === 'timeline' && (
        <Card title="Kitchen notes">
          {timeline.length === 0 ? (
            <p className={listStyles.empty}>I’ll note changes here as you add, use, and move things.</p>
          ) : (
            <ul className={styles.timelineList}>
              {timeline.slice(0, 50).map(entry => (
                <li key={entry.id} className={styles.timelineItem}>
                  <span className={styles.timelineIcon}>{entry.icon}</span>
                  <div className={styles.timelineBody}>
                    <strong>{entry.label}: {entry.itemName}</strong>
                    {entry.note && <p className={styles.timelineMeta}>{entry.note}</p>}
                    <p className={styles.timelineMeta}>
                      {format(parseISO(entry.timestamp), 'MMM d, h:mm a')} · {entry.runningCount} items active
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {!showTabSkeleton && tab === 'advisor' && (
        <div className={styles.advisorSection}>
          <Card title="Kitchen Advisor">
            <p className={styles.advisorIntro}>Rule-based insights from your inventory, habits, and meal plan.</p>
          </Card>
          {adviceList.length === 0 ? (
            <Card><p className={listStyles.empty}>Your kitchen looks good!</p></Card>
          ) : (
            adviceList.map(tip => (
              <Card key={tip.id}>
                <div className={styles.advisorCard}>
                  <strong>{tip.icon} {tip.title}</strong>
                  <p className={styles.recMessage}>{tip.message}</p>
                  {tip.tab && (
                    <Button size="sm" variant="secondary" onClick={() => switchTab(tip.tab as KitchenTab)}>{tip.action ?? 'View'}</Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {!showTabSkeleton && tab === 'waste' && wasteSummary && dashboard && (
        <>
          <div className={styles.wasteMetrics}>
            <div className={styles.wasteMetric}><strong className={styles.statusExpired}>${wasteSummary.moneyLost.toFixed(0)}</strong><span>Money lost</span></div>
            <div className={styles.wasteMetric}><strong className={styles.statusSuccess}>${wasteSummary.moneySaved.toFixed(0)}</strong><span>Money saved</span></div>
            <div className={styles.wasteMetric}><strong>{wasteSummary.itemsExpired}</strong><span>Items expired</span></div>
            <div className={styles.wasteMetric}><strong>{wasteSummary.itemsRescued}</strong><span>Items rescued</span></div>
            <div className={styles.wasteMetric}><strong>{wasteSummary.wasteTrend}</strong><span>Waste trend</span></div>
            <div className={styles.wasteMetric}><strong className={styles[`status${dashboard.wasteRisk === 'low' ? 'Fresh' : dashboard.wasteRisk === 'medium' ? 'Soon' : 'Expired'}`]}>{dashboard.wasteRisk}</strong><span>Waste risk</span></div>
          </div>
          <Card title="Prevent waste">
            <p className={styles.advisorIntro}>Freeze, cook, or donate before items expire. Track progress via inventory events.</p>
            <Button onClick={() => switchTab('expiration')}>Open Expiration Center</Button>
          </Card>
        </>
      )}

      {!showTabSkeleton && tab === 'shopping' && (
        <div className={styles.advisorSection}>
          <NextShoppingSection
            headline={nextShoppingTrip.headline}
            items={nextShoppingTrip.items}
            estimatedTotal={nextShoppingTrip.estimatedTotal}
          />

          {runningLowCategories.length > 0 && kitchenSummary && (
            <RunningLowPanel
              categories={runningLowCategories}
              summary={kitchenSummary}
              showSummary
            />
          )}

          {refillPredictions.length > 0 && (
            <SectionToggle
              title="Predicted refills"
              summary={`${refillPredictions.filter(p => p.urgency !== 'plenty').length} need attention`}
              defaultExpanded={false}
            >
              {refillPredictions.slice(0, 8).map(p => (
                <div key={p.itemName} className={styles.recCard}>
                  <div className={styles.recHeader}>
                    <span className={`${styles.priority} ${styles[p.urgency === 'buy-now' ? 'high' : p.urgency === 'buy-soon' ? 'medium' : 'low']}`}>●</span>
                    <strong>{p.itemName}</strong>
                    <span className={listStyles.badge}>
                      {p.urgency === 'buy-now' ? 'Buy Now' : p.urgency === 'buy-soon' ? 'Buy Soon' : 'Plenty'}
                    </span>
                  </div>
                  <p className={styles.recMessage}>{p.message}</p>
                  {p.urgency !== 'plenty' && (() => {
                    const offer = shouldOfferAddToList(p.itemName, undefined, {
                      pantry: allItems,
                      groceryList: groceryList ?? [],
                      context: 'recommendation',
                    })
                    if (!offer.offer) {
                      return offer.skipReason
                        ? <p className={styles.enoughNote}>✓ {offer.skipReason}</p>
                        : null
                    }
                    return (
                      <Button size="sm" variant="secondary" onClick={() => addToGroceryList(p.itemName)}>
                        + Grocery list
                      </Button>
                    )
                  })()}
                </div>
              ))}
            </SectionToggle>
          )}

          <SectionToggle
            title="All shopping recommendations"
            summary={`${recommendations.filter(r => !r.alreadyHave).length} items`}
            count={recommendations.filter(r => !r.alreadyHave).length}
            defaultExpanded={false}
          >
            <p className={styles.advisorIntro}>Based on pantry, meal plan, grocery list, and coupons.</p>
            {recommendations.map(rec => (
              <div key={rec.id} className={styles.recCard}>
                <div className={styles.recHeader}>
                  <span className={`${styles.priority} ${styles[rec.priority]}`}>{rec.priority === 'high' ? '●' : '○'}</span>
                  <strong>{rec.itemName}</strong>
                  {rec.alreadyHave && <span className={listStyles.badge}>Already have plenty</span>}
                  {rec.couponAvailable && <span className={styles.couponBadge}>🏷️ Coupon</span>}
                </div>
                <p className={styles.recMessage}>{rec.message}</p>
                {!rec.alreadyHave && rec.reason !== 'expiring-soon' && (() => {
                  const offer = shouldOfferAddToList(rec.itemName, undefined, {
                    pantry: allItems,
                    groceryList: groceryList ?? [],
                    context: rec.reason === 'meal-plan' ? 'recipe' : 'recommendation',
                  })
                  if (!offer.offer) {
                    return offer.skipReason
                      ? <p className={styles.enoughNote}>✓ {offer.skipReason}</p>
                      : null
                  }
                  return (
                    <Button size="sm" variant="secondary" onClick={() => addToGroceryList(rec.itemName)}>
                      + Add to grocery list
                    </Button>
                  )
                })()}
              </div>
            ))}
          </SectionToggle>
        </div>
      )}

      {!showTabSkeleton && tab === 'decisions' && (
        <Card title="Kitchen Decision Center">
          {decisions.length === 0 ? (
            <p className={listStyles.empty}>
              No kitchen decisions right now — you&apos;re in good shape.{' '}
              <Link to="/today">Check Life</Link> or browse the{' '}
              <button type="button" className={styles.sectionLink} onClick={() => switchTab('planner')}>
                meal planner
              </button>
              .
            </p>
          ) : (
            <div className={styles.decisionGrid}>
              {decisions.map(d => (
                <button
                  key={d.id}
                  type="button"
                  className={styles.decisionBtn}
                  onClick={() => {
                    if (d.tab) switchTab(d.tab as KitchenTab)
                    else if (d.route.startsWith('/kitchen')) switchTab('dashboard')
                    else navigate(d.route)
                  }}
                >
                  <span className={styles.decisionIcon}>{d.icon}</span>
                  <span className={styles.decisionLabel}>{d.label}</span>
                  <p className={styles.decisionDesc}>{d.description}</p>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {!showTabSkeleton && tab === 'planner' && weeklyPlan && (
        <Card title="Weekly Meal Plan">
          <MealPlanList
            weeklyPlan={weeklyPlan}
            userMeals={meals ?? []}
            ranked={rankedMeals}
            feedbackByRecipeId={feedbackByRecipeId}
            onAddToGrocery={addToGroceryList}
            onOpenDetail={m => setViewingMatch(m)}
          />
          <button type="button" className={styles.quickAction} onClick={() => switchTab('planner')}>
            Open Meal Planning →
          </button>
        </Card>
      )}

      {showReceiptScanner && !receiptReview && (
        <ReceiptScanner
          onResult={result => { setReceiptReview(result); setShowReceiptScanner(false) }}
          onClose={() => setShowReceiptScanner(false)}
        />
      )}

      {receiptReview && (
        <ReceiptReview
          result={receiptReview}
          onSave={savePantryReceipt}
          onCancel={() => setReceiptReview(null)}
        />
      )}

      {showScanner && (
        <CouponScanner
          variant={locationFilter === 'spice' || location === 'spice' ? 'spice' : 'pantry'}
          onResult={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      {viewingMatch && (
        <RecipeDetail
          recipe={matchToViewData(viewingMatch)}
          onClose={() => setViewingMatch(null)}
        />
      )}
    </div>
  )
}
