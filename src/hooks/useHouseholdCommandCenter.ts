import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useBills,
  useHealthToday,
  useHouseholdTasks,
  useMeals,
  usePantryItems,
  usePets,
  useRecipes,
  useUserProfile,
  useLifeProfile,
} from './useHavenData'
import { useHBISnapshot } from './useHBI'
import { debounceSchedule, deferNonCritical } from '../lib/deferWork'
import { getPersonalDashboardStats } from '../lib/buyingIntelligence/commandCenterData'
import { getTodaysCelebrations, seedCelebrationMemories } from '../lib/lifeMemories'
import { fetchWeather } from '../lib/weatherPrep'
import { rankMealsFromInventory } from '../lib/mealEngine'
import { getDiverseTonightOptions } from '../lib/mealSuggestionEngine'
import { resolveFoodExclusions } from '../lib/havenChat/personalizationMemory'
import {
  generateCommandCenterBrief,
  getQuickWelcomeShell,
  type CommandCenterBrief,
} from '../lib/householdCommandCenter'
import { calculatePreparednessScore, getSupplyIntelligence } from '../lib/preparedness'
import { db, type SavingsGoal } from '../db/database'
import type { WeatherData } from '../lib/weatherPrep'
import type { MealMatch } from '../lib/mealEngine'
import type { MealSuggestion } from '../lib/mealSuggestionEngine'
import type { CelebrationMemory } from '../lib/lifeMemories'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000

function isMobilePhone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 768px)').matches
}

export interface HouseholdCommandCenterData {
  brief: CommandCenterBrief | null
  welcomeShell: CommandCenterBrief['welcome']
  loading: boolean
  deferredReady: boolean
  refresh: () => void
}

/**
 * Home-only data path — intentionally does NOT call useBriefingData/useToday
 * (those open 20+ Dexie live queries and stall phones).
 */
export function useHouseholdCommandCenter(): HouseholdCommandCenterData {
  const profile = useUserProfile()
  const lifeProfile = useLifeProfile()
  const health = useHealthToday()
  const bills = useBills()
  const meals = useMeals()
  const pantry = usePantryItems()
  const recipes = useRecipes()
  const pets = usePets()
  const householdTasks = useHouseholdTasks()
  const hbi = useHBISnapshot()

  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [hbiStats, setHbiStats] = useState<{ potentialSavings: number; buyCount: number } | null>(null)
  const [celebrations, setCelebrations] = useState<CelebrationMemory[]>([])
  const [rankedMeals, setRankedMeals] = useState<MealMatch[]>([])
  const [tonightOptions, setTonightOptions] = useState<MealSuggestion[]>([])
  const [brief, setBrief] = useState<CommandCenterBrief | null>(null)
  const [preparednessReady, setPreparednessReady] = useState(false)
  const [preparednessScore, setPreparednessScore] = useState<Awaited<ReturnType<typeof calculatePreparednessScore>> | null>(null)
  const [supplies, setSupplies] = useState<Awaited<ReturnType<typeof getSupplyIntelligence>>>([])
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([])
  const [adultingChecklist, setAdultingChecklist] = useState<string[]>([])
  const refreshToken = useRef(0)
  const mobile = useMemo(() => isMobilePhone(), [])

  const welcomeShell = useMemo(
    () => getQuickWelcomeShell({ userName: profile?.name, reference: new Date() }),
    [profile?.name],
  )

  useEffect(() => {
    const loc = lifeProfile?.weatherLocation
    if (!loc) {
      setWeather(null)
      return
    }
    let cancelled = false
    fetchWeather(loc, lifeProfile).then(r => {
      if (!cancelled) setWeather(r.data)
    })
    return () => { cancelled = true }
  }, [lifeProfile?.weatherLocation?.lat, lifeProfile?.weatherLocation?.lon, lifeProfile])

  useEffect(() => {
    if (!hbi) {
      setHbiStats(null)
      return
    }
    let cancelled = false
    deferNonCritical(() => {
      getPersonalDashboardStats(hbi).then(stats => {
        if (!cancelled) {
          setHbiStats({ potentialSavings: stats.potentialSavings, buyCount: stats.buyCount })
        }
      }).catch(() => {})
    }, mobile ? 4000 : 2000)
    return () => { cancelled = true }
  }, [hbi, mobile])

  useEffect(() => {
    if (!pantry || !recipes) return
    let cancelled = false
    // Meal ranking is CPU-heavy — wait longer on phones so hero paints first.
    deferNonCritical(() => {
      const food = pantry.filter(i => i.quantity > 0 && i.location !== 'spice')
      const spice = pantry.filter(i => i.quantity > 0 && i.location === 'spice')
      const ranked = rankMealsFromInventory(food, spice, recipes)
      const diverse = getDiverseTonightOptions({
        pantry: food,
        spiceRack: spice,
        userRecipes: recipes,
        maxResults: mobile ? 4 : 8,
        minVariety: true,
        context: {
          foodExclusions: resolveFoodExclusions(lifeProfile?.userPreferences),
        },
      })
      if (!cancelled) {
        setRankedMeals(
          lifeProfile?.userPreferences
            ? ranked.filter(m => {
                const ex = resolveFoodExclusions(lifeProfile.userPreferences)
                if (ex.length === 0) return true
                const hay = [m.name, ...m.haveIngredients, ...m.missingIngredients].join(' ').toLowerCase()
                return !ex.some(e => hay.includes(e))
              })
            : ranked,
        )
        setTonightOptions(diverse)
      }
    }, mobile ? 5000 : 2500)
    return () => { cancelled = true }
  }, [pantry, recipes, lifeProfile?.userPreferences, mobile])

  useEffect(() => {
    let cancelled = false
    deferNonCritical(() => {
      seedCelebrationMemories()
        .then(() => getTodaysCelebrations())
        .then(items => {
          if (!cancelled) setCelebrations(items)
        })
        .catch(() => {})
    }, mobile ? 6000 : 3000)
    return () => { cancelled = true }
  }, [mobile])

  useEffect(() => {
    let cancelled = false
    deferNonCritical(async () => {
      const [score, supplyList, goals, adulting] = await Promise.all([
        calculatePreparednessScore(),
        getSupplyIntelligence(),
        db.savingsGoals.toArray(),
        db.adultingProgress.toCollection().first(),
      ])
      if (!cancelled) {
        setPreparednessScore(score)
        setSupplies(supplyList)
        setSavingsGoals(goals)
        setAdultingChecklist(adulting?.checklistProgress['emergency-kit'] ?? [])
        setPreparednessReady(true)
      }
    }, mobile ? 8000 : 4000)
    return () => { cancelled = true }
  }, [mobile])

  const runBrief = useCallback(() => {
    // First paint: pantry + bills are enough. Do not wait on celebrations / meals.
    if (pantry === undefined || bills === undefined) return

    const token = ++refreshToken.current
    deferNonCritical(() => {
      generateCommandCenterBrief({
        userName: profile?.name,
        reference: new Date(),
        weather,
        meals: meals ?? [],
        pantry: pantry ?? [],
        bills: bills ?? [],
        householdTasks: householdTasks ?? [],
        recipes: recipes ?? [],
        rankedMeals,
        tonightOptions,
        todayStats: null,
        todayDecisions: [],
        hbi,
        hbiStats,
        waterProgress: health?.waterGlasses ?? 0,
        waterGoal: health?.waterGoal ?? 8,
        celebrations,
        pets: pets ?? [],
        preparednessScore: preparednessReady ? preparednessScore : null,
        supplies: preparednessReady ? supplies : [],
        savingsGoals: preparednessReady ? savingsGoals : [],
        adultingChecklist: preparednessReady ? adultingChecklist : [],
      }).then(result => {
        if (token === refreshToken.current) {
          setBrief(result.brief)
        }
      }).catch(() => {})
    }, 0)
  }, [
    profile?.name,
    weather,
    meals,
    pantry,
    bills,
    householdTasks,
    recipes,
    rankedMeals,
    tonightOptions,
    hbi,
    hbiStats,
    health,
    celebrations,
    pets,
    preparednessReady,
    preparednessScore,
    supplies,
    savingsGoals,
    adultingChecklist,
  ])

  useEffect(() => {
    const { schedule, cancel } = debounceSchedule(runBrief, mobile ? 500 : 350)
    schedule()
    return cancel
  }, [runBrief, mobile])

  useEffect(() => {
    const id = window.setInterval(runBrief, REFRESH_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [runBrief])

  const loading = pantry === undefined || bills === undefined
  const deferredReady = !!brief && !loading

  return {
    brief,
    welcomeShell,
    loading,
    deferredReady,
    refresh: runBrief,
  }
}
