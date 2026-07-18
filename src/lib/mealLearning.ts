import { format } from 'date-fns'
import { db, type MealLearningEntry, type MealRating } from '../db/database'
import {
  bumpChangeStats,
  findPendingEvolution,
  mergeUniqueNames,
  type PendingEvolution,
} from './recipeEvolution'

export type { MealLearningEntry }
export type { PendingEvolution }

export type MealLearningProfile = MealLearningEntry

const PROFILE_KEY = 'meal-learning'

export async function getMealLearningProfiles(): Promise<MealLearningProfile[]> {
  return db.mealLearning.toArray()
}

export async function getLearningProfile(recipeKey: string): Promise<MealLearningProfile | undefined> {
  return db.mealLearning.where('recipeKey').equals(recipeKey).first()
}

export async function recordMealCooked(recipeKey: string, recipeName: string): Promise<void> {
  const existing = await getLearningProfile(recipeKey)
  const now = new Date().toISOString()
  if (existing?.id) {
    await db.mealLearning.update(existing.id, {
      cookCount: existing.cookCount + 1,
      lastCookedAt: now,
      recipeName,
      updatedAt: now,
    })
  } else {
    await db.mealLearning.add({
      recipeKey,
      recipeName,
      cookCount: 1,
      skipCount: 0,
      isFavorite: false,
      updatedAt: now,
    })
  }
}

export async function saveCookLearning(params: {
  recipeKey: string
  recipeName: string
  personalName?: string
  lastCookNote?: string
  addedIngredients?: string[]
  removedIngredients?: string[]
}): Promise<PendingEvolution | null> {
  const existing = await getLearningProfile(params.recipeKey)
  const now = new Date().toISOString()
  const addedStats = bumpChangeStats(existing?.addedIngredientStats, params.addedIngredients ?? [], now)
  const removedStats = bumpChangeStats(existing?.removedIngredientStats, params.removedIngredients ?? [], now)
  const patch: Partial<MealLearningEntry> = {
    recipeName: params.recipeName,
    updatedAt: now,
    addedIngredientStats: addedStats,
    removedIngredientStats: removedStats,
    addedIngredients: mergeUniqueNames(existing?.addedIngredients, params.addedIngredients),
    removedIngredients: mergeUniqueNames(existing?.removedIngredients, params.removedIngredients),
  }
  if (params.personalName?.trim()) patch.personalName = params.personalName.trim()
  if (params.lastCookNote !== undefined) patch.lastCookNote = params.lastCookNote.trim() || undefined

  if (existing?.id) {
    await db.mealLearning.update(existing.id, patch)
  } else {
    await db.mealLearning.add({
      recipeKey: params.recipeKey,
      recipeName: params.recipeName,
      cookCount: 0,
      skipCount: 0,
      isFavorite: false,
      ...patch,
      updatedAt: now,
    })
  }

  const updated = await getLearningProfile(params.recipeKey)
  return updated ? findPendingEvolution(updated) : null
}

export async function getRecipeLogDetail(recipeKey: string): Promise<{
  entry: MealLearningProfile
  avgRating: number | null
  ratingCount: number
  pendingEvolution: PendingEvolution | null
} | null> {
  const entry = await getLearningProfile(recipeKey)
  if (!entry) return null
  const ratings = await db.mealRatings
    .filter(r =>
      r.recipeName.toLowerCase() === (entry.personalName ?? entry.recipeName).toLowerCase()
      || r.recipeName.toLowerCase() === entry.recipeName.toLowerCase(),
    )
    .toArray()
  const avgRating = ratings.length
    ? Math.round((ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10) / 10
    : null
  return {
    entry,
    avgRating,
    ratingCount: ratings.length,
    pendingEvolution: findPendingEvolution(entry),
  }
}

export async function getRecipeLogEntries(limit = 12): Promise<MealLearningProfile[]> {
  const all = await db.mealLearning.toArray()
  return all
    .filter(e => e.cookCount > 0 || e.personalName || e.lastCookNote)
    .sort((a, b) => {
      const aT = a.lastCookedAt ?? a.updatedAt
      const bT = b.lastCookedAt ?? b.updatedAt
      return bT.localeCompare(aT)
    })
    .slice(0, limit)
}

export function displayRecipeName(entry: MealLearningProfile): string {
  return entry.personalName?.trim() || entry.recipeName
}

export async function recordMealSkipped(recipeKey: string, recipeName: string): Promise<void> {
  const existing = await getLearningProfile(recipeKey)
  const now = new Date().toISOString()
  if (existing?.id) {
    await db.mealLearning.update(existing.id, {
      skipCount: existing.skipCount + 1,
      lastSkippedAt: now,
      updatedAt: now,
    })
  } else {
    await db.mealLearning.add({
      recipeKey,
      recipeName,
      cookCount: 0,
      skipCount: 1,
      isFavorite: false,
      updatedAt: now,
    })
  }
}

export async function toggleFavorite(recipeKey: string, recipeName: string, favorite: boolean): Promise<void> {
  const existing = await getLearningProfile(recipeKey)
  const now = new Date().toISOString()
  if (existing?.id) {
    await db.mealLearning.update(existing.id, { isFavorite: favorite, updatedAt: now })
  } else {
    await db.mealLearning.add({
      recipeKey,
      recipeName,
      cookCount: 0,
      skipCount: 0,
      isFavorite: favorite,
      updatedAt: now,
    })
  }
}

export function learningBoost(profile: MealLearningProfile | undefined): number {
  if (!profile) return 0
  let boost = 0
  if (profile.isFavorite) boost += 12
  if (profile.cookCount >= 5) boost += 8
  else if (profile.cookCount >= 2) boost += 4
  if (profile.skipCount >= 3) boost -= 6
  const month = new Date().getMonth() + 1
  if (profile.seasonalMonth === month) boost += 5
  if (profile.personalName) boost += 3
  if ((profile.defaultAdditions?.length ?? 0) + (profile.defaultRemovals?.length ?? 0) > 0) boost += 5
  return boost
}

export async function getMealRatings(): Promise<MealRating[]> {
  return db.mealRatings.orderBy('cookedAt').reverse().toArray()
}

export function getLovedIngredientPatterns(ratings: MealRating[]): string[] {
  const loved = ratings.filter(r => r.rating >= 4)
  const counts = new Map<string, number>()
  for (const r of loved) {
    for (const ing of r.ingredientsUsed) {
      const key = ing.toLowerCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name)
}

export function mealRatingBoost(
  recipeId: number | undefined,
  recipeName: string,
  ratings: MealRating[],
  recipeIngredients: string[] = [],
): number {
  const forRecipe = ratings.filter(
    r => r.recipeId === recipeId ||
      r.recipeName.toLowerCase() === recipeName.toLowerCase(),
  )
  if (forRecipe.length > 0) {
    const avg = forRecipe.reduce((s, r) => s + r.rating, 0) / forRecipe.length
    if (avg >= 4.5) return 15
    if (avg >= 4) return 10
    if (avg >= 3) return 3
    if (avg < 2.5) return -5
    return 0
  }

  const lovedPatterns = getLovedIngredientPatterns(ratings)
  if (lovedPatterns.length === 0 || recipeIngredients.length === 0) return 0

  const lower = recipeIngredients.map(i => i.toLowerCase())
  let matches = 0
  for (const pattern of lovedPatterns) {
    if (lower.some(i => i.includes(pattern) || pattern.includes(i))) matches++
  }
  return Math.min(matches * 4, 12)
}

export function buildMealRatingInsight(ratings: MealRating[]): string | null {
  const loved = getLovedIngredientPatterns(ratings)
  if (loved.length < 2) return null
  const pair = loved.slice(0, 2).join(' + ')
  return `You loved meals with ${pair} — here's another`
}

export async function getHighlyRatedRecipes(limit = 5): Promise<{ name: string; avgRating: number }[]> {
  const ratings = await getMealRatings()
  const byName = new Map<string, number[]>()
  for (const r of ratings) {
    const list = byName.get(r.recipeName) ?? []
    list.push(r.rating)
    byName.set(r.recipeName, list)
  }
  return [...byName.entries()]
    .map(([name, scores]) => ({
      name,
      avgRating: scores.reduce((s, v) => s + v, 0) / scores.length,
    }))
    .filter(r => r.avgRating >= 4)
    .sort((a, b) => b.avgRating - a.avgRating)
    .slice(0, limit)
}

export async function getActivePantryChallenge() {
  const weekStart = format(getWeekStart(new Date()), 'yyyy-MM-dd')
  return db.pantryChallenge.where('weekStart').equals(weekStart).first()
}

export async function updatePantryChallenge(delta: {
  mealsCompleted?: number
  moneySaved?: number
  wastePrevented?: number
}): Promise<void> {
  const weekStart = format(getWeekStart(new Date()), 'yyyy-MM-dd')
  const existing = await db.pantryChallenge.where('weekStart').equals(weekStart).first()
  if (existing?.id) {
    await db.pantryChallenge.update(existing.id, {
      mealsCompleted: existing.mealsCompleted + (delta.mealsCompleted ?? 0),
      moneySaved: existing.moneySaved + (delta.moneySaved ?? 0),
      wastePrevented: existing.wastePrevented + (delta.wastePrevented ?? 0),
    })
  } else {
    await db.pantryChallenge.add({
      weekStart,
      mealsCompleted: delta.mealsCompleted ?? 0,
      moneySaved: delta.moneySaved ?? 0,
      wastePrevented: delta.wastePrevented ?? 0,
      active: true,
    })
  }
}

function getWeekStart(ref: Date): Date {
  const d = new Date(ref)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export { PROFILE_KEY }
