import { format } from 'date-fns'
import { db, type MealRatingSource } from '../db/database'
import { buildInventorySnapshot, getMissingRequired, matchRecipeIngredients } from './ingredientMatcher'
import hie from './intelligence/hie'
import { mealEngine } from './mealEngine'
import { recordMealCooked, saveCookLearning, updatePantryChallenge } from './mealLearning'
import type { PendingEvolution } from './recipeEvolution'
import { recordVillageActivity } from './villageWorldEngine'
import { shouldOfferAddToList } from './shoppingIntelligence/shouldOfferAddToList'
import { addToGroceryList as persistGroceryItem } from './shoppingIntelligence/groceryListService'
import { recordTimelineEvent } from './householdTimeline'
import { consumeIngredientsForMeal } from './inventoryService'
import type { RecipeFeedbackTag } from '../db/database'

export type { MealRatingSource }

export interface MealRecommendationContext {
  recipeId?: number
  recipeName: string
  ingredientsUsed?: string[]
  missingIngredients?: string[]
  source: MealRatingSource
}

export interface LetsMakeItResult {
  mealPlanned: boolean
  addedToGrocery: string[]
  navigateTo: string
  missingIngredients: string[]
}

async function resolveMissingIngredients(ctx: MealRecommendationContext): Promise<string[]> {
  if (ctx.missingIngredients?.length) return ctx.missingIngredients
  if (!ctx.recipeId) return []

  const recipe = await db.recipes.get(ctx.recipeId)
  if (!recipe) return []

  const pantry = await db.pantryItems.filter(i => i.quantity > 0).toArray()
  const snapshot = buildInventorySnapshot(pantry)
  const match = matchRecipeIngredients(recipe.ingredients, recipe.spices, snapshot)
  return getMissingRequired(match)
}

export async function planTonightDinner(recipeName: string, ingredients: string[] = []): Promise<boolean> {
  const today = format(new Date(), 'yyyy-MM-dd')
  const existing = await db.meals.filter(m => m.day === today && m.mealType === 'dinner').first()
  if (existing) return false

  await db.meals.add({
    name: recipeName,
    day: today,
    mealType: 'dinner',
    ingredients,
    notes: 'Planned from Haven recommendation',
  })
  return true
}

export async function addMissingToShoppingList(names: string[]): Promise<string[]> {
  const pantry = await db.pantryItems.filter(i => i.quantity > 0).toArray()
  const groceryList = await db.groceryList.toArray()
  const added: string[] = []
  for (const name of names) {
    const offer = shouldOfferAddToList(name, undefined, {
      pantry,
      groceryList,
      context: 'recipe',
    })
    if (!offer.offer) continue
    const result = await persistGroceryItem(name, { category: 'Cook Tonight', skipIfDuplicate: true })
    if (result.added) added.push(name)
  }
  return added
}

export async function letsMakeIt(
  ctx: MealRecommendationContext,
  options?: { addMissingToList?: boolean },
): Promise<LetsMakeItResult> {
  const missing = await resolveMissingIngredients(ctx)
  const mealPlanned = await planTonightDinner(ctx.recipeName, ctx.ingredientsUsed ?? [])

  let addedToGrocery: string[] = []
  if (options?.addMissingToList && missing.length > 0) {
    addedToGrocery = await addMissingToShoppingList(missing)
  }

  const navigateTo = ctx.recipeId
    ? `/kitchen?recipe=${ctx.recipeId}`
    : `/kitchen?tab=planner&search=${encodeURIComponent(ctx.recipeName)}`

  mealEngine.refreshDebounced({ trigger: 'kitchen-updated' })

  return { mealPlanned, addedToGrocery, navigateTo, missingIngredients: missing }
}

export async function markMealCookedToday(_recipeName: string): Promise<void> {
  const today = format(new Date(), 'yyyy-MM-dd')
  const meal = await db.meals.filter(m => m.day === today && m.mealType === 'dinner').first()
  if (meal?.id) {
    await db.meals.update(meal.id, {
      notes: `Cooked ${format(new Date(), 'h:mm a')}`,
    })
  }
}

export function recipeLearningKey(recipeId?: number, recipeName?: string): string {
  if (recipeId) return `recipe-${recipeId}`
  return `named-${recipeName ?? 'meal'}`
}

export async function finalizeMealCooked(params: {
  recipeId?: number
  recipeName: string
  ingredientsUsed?: string[]
  /** Soft pantry update — default true */
  updateKitchen?: boolean
}): Promise<{ kitchenAdjusted: number; kitchenNames: string[] }> {
  await markMealCookedToday(params.recipeName)
  const recipeKey = recipeLearningKey(params.recipeId, params.recipeName)
  await recordMealCooked(recipeKey, params.recipeName)
  await updatePantryChallenge({ mealsCompleted: 1 })
  await recordCookedStoryMemory(params.recipeName, params.recipeId)
  await recordVillageActivity(`Cooked ${params.recipeName}`, '🍳', 'bakery')

  let kitchenAdjusted = 0
  let kitchenNames: string[] = []
  if (params.updateKitchen !== false) {
    let ingredients = params.ingredientsUsed ?? []
    let spices: string[] = []
    if (params.recipeId) {
      const recipe = await db.recipes.get(params.recipeId)
      if (recipe) {
        if (ingredients.length === 0) ingredients = recipe.ingredients
        spices = recipe.spices ?? []
      }
    }
    if (ingredients.length > 0 || spices.length > 0) {
      const result = await consumeIngredientsForMeal({
        recipeName: params.recipeName,
        ingredients,
        spices,
      })
      kitchenAdjusted = result.adjusted
      kitchenNames = result.names
    }
  }

  mealEngine.refreshDebounced({ trigger: 'recipe-completed' })
  hie.refreshDebounced({ trigger: 'meal-cooked', module: 'kitchen' })
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('haven:recipe-log-updated'))
  }
  return { kitchenAdjusted, kitchenNames }
}

async function recordCookedStoryMemory(recipeName: string, recipeId?: number): Promise<void> {
  const date = format(new Date(), 'yyyy-MM-dd')
  const sourceId = recipeId ? `cooked-recipe-${recipeId}-${date}` : `cooked-${recipeName.toLowerCase().replace(/\s+/g, '-')}-${date}`
  const existing = await db.storyMemories
    .filter(m => m.sourceModule === 'kitchen' && m.sourceId === sourceId)
    .first()
  if (existing) return

  await db.storyMemories.add({
    title: `Cooked ${recipeName} tonight`,
    description: 'A meal from your pantry recommendations',
    date,
    chapter: 'memories',
    sourceModule: 'kitchen',
    sourceId,
    autoGenerated: true,
    createdAt: new Date().toISOString(),
  })
}

export async function saveMealRating(params: {
  recipeId?: number
  recipeName: string
  rating: number
  ingredientsUsed?: string[]
  source: MealRatingSource
  note?: string
  tags?: RecipeFeedbackTag[]
  personalName?: string
  addedIngredients?: string[]
  removedIngredients?: string[]
}): Promise<{ pendingEvolution: PendingEvolution | null }> {
  const cookedAt = new Date().toISOString()
  const displayName = params.personalName?.trim() || params.recipeName

  await db.mealRatings.add({
    recipeId: params.recipeId,
    recipeName: displayName,
    rating: params.rating,
    cookedAt,
    ingredientsUsed: params.ingredientsUsed ?? [],
    source: params.source,
  })

  const recipeKey = recipeLearningKey(params.recipeId, params.recipeName)
  const pendingEvolution = await saveCookLearning({
    recipeKey,
    recipeName: params.recipeName,
    personalName: params.personalName,
    lastCookNote: params.note,
    addedIngredients: params.addedIngredients,
    removedIngredients: params.removedIngredients,
  })

  void recordTimelineEvent({
    category: 'meals',
    icon: '🍽️',
    title: `Made ${displayName}`,
    detail: params.rating ? `Rated ${params.rating}/5` : undefined,
    source: 'meals',
    searchableText: `${displayName} ${params.recipeName} meal cooked rated`,
    entityId: `meal-${cookedAt}-${params.recipeName}`,
    entityType: 'meal-rating',
    timestamp: cookedAt,
  })

  const tags: RecipeFeedbackTag[] = [...(params.tags ?? [])]
  if (params.rating >= 4 && !tags.includes('family-loved')) tags.push('family-loved')
  if (params.rating >= 4 && !tags.includes('make-again')) tags.push('make-again')

  if (params.recipeId) {
    await db.recipeFeedback.add({
      recipeId: params.recipeId,
      cookedAt,
      rating: params.rating,
      tags,
      note: params.note,
    })
  }

  if (params.rating >= 4) {
    const { recordHabit } = await import('./intelligence/learningEngine')
    await recordHabit({
      key: `meal-loved:${params.recipeName.toLowerCase()}`,
      category: 'preference',
      value: displayName,
      confidence: 0.7 + params.rating * 0.05,
    })
  }

  hie.refreshDebounced({ trigger: 'meal-rated', module: 'kitchen' })
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('haven:recipe-log-updated'))
  }

  return { pendingEvolution }
}

export function mealContextFromPayload(
  payload: Record<string, unknown> | undefined,
  source: MealRatingSource,
): MealRecommendationContext | null {
  if (!payload?.recipeName && !payload?.itemName) return null
  const recipeName = (payload.recipeName as string) ?? (payload.itemName as string)
  if (!recipeName) return null
  return {
    recipeId: payload.recipeId as number | undefined,
    recipeName,
    ingredientsUsed: payload.ingredientsUsed as string[] | undefined,
    missingIngredients: payload.missingIngredients as string[] | undefined,
    source,
  }
}

export function mealContextFromMatch(
  match: { recipeId?: number; name: string; haveIngredients?: string[]; missingIngredients?: string[] },
  source: MealRatingSource,
): MealRecommendationContext {
  return {
    recipeId: match.recipeId,
    recipeName: match.name,
    ingredientsUsed: match.haveIngredients,
    missingIngredients: match.missingIngredients,
    source,
  }
}
