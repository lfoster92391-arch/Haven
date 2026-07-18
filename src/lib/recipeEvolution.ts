import type {
  IngredientChangeStat,
  MealLearningEntry,
  RecipeEvolutionDecision,
} from '../db/database'
import { getLearningProfile } from './mealLearning'
import { db } from '../db/database'

/** Vision: repeated change → offer to make it the default. Soft threshold for Founders. */
export const EVOLUTION_THRESHOLD = 3

export type EvolutionKind = 'add' | 'remove'

export interface PendingEvolution {
  recipeKey: string
  recipeName: string
  personalName?: string
  kind: EvolutionKind
  ingredient: string
  count: number
  message: string
}

function normalizeIngredient(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

function ingredientKey(name: string): string {
  return normalizeIngredient(name).toLowerCase()
}

export function bumpChangeStats(
  existing: IngredientChangeStat[] | undefined,
  names: string[],
  now: string,
): IngredientChangeStat[] {
  const next = [...(existing ?? [])]
  for (const raw of names) {
    const name = normalizeIngredient(raw)
    if (!name || name === '(custom)') continue
    const key = ingredientKey(name)
    const idx = next.findIndex(s => ingredientKey(s.name) === key)
    if (idx >= 0) {
      next[idx] = {
        name: next[idx].name,
        count: next[idx].count + 1,
        lastSeenAt: now,
      }
    } else {
      next.push({ name, count: 1, lastSeenAt: now })
    }
  }
  return next
}

export function mergeUniqueNames(
  existing: string[] | undefined,
  incoming: string[] | undefined,
): string[] | undefined {
  if (!incoming?.length) return existing
  const set = new Map<string, string>()
  for (const n of existing ?? []) {
    const name = normalizeIngredient(n)
    if (name) set.set(ingredientKey(name), name)
  }
  for (const n of incoming) {
    const name = normalizeIngredient(n)
    if (!name || name === '(custom)') continue
    set.set(ingredientKey(name), name)
  }
  return [...set.values()]
}

function decisionFor(
  entry: MealLearningEntry,
  ingredient: string,
): RecipeEvolutionDecision | undefined {
  return entry.evolutionDecisions?.[ingredientKey(ingredient)]
}

function alreadyDefault(entry: MealLearningEntry, kind: EvolutionKind, ingredient: string): boolean {
  const list = kind === 'add' ? entry.defaultAdditions : entry.defaultRemovals
  return (list ?? []).some(n => ingredientKey(n) === ingredientKey(ingredient))
}

export function findPendingEvolution(entry: MealLearningEntry): PendingEvolution | null {
  const display = entry.personalName?.trim() || entry.recipeName

  const consider = (
    stats: IngredientChangeStat[] | undefined,
    kind: EvolutionKind,
  ): PendingEvolution | null => {
    if (!stats?.length) return null
    const sorted = [...stats].sort((a, b) => b.count - a.count)
    for (const stat of sorted) {
      if (stat.count < EVOLUTION_THRESHOLD) continue
      if (alreadyDefault(entry, kind, stat.name)) continue
      const decision = decisionFor(entry, stat.name)
      if (decision === 'accepted' || decision === 'declined') continue
      // keep-asking and undefined both surface again
      return {
        recipeKey: entry.recipeKey,
        recipeName: entry.recipeName,
        personalName: entry.personalName,
        kind,
        ingredient: stat.name,
        count: stat.count,
        message:
          kind === 'add'
            ? `I noticed you often add ${stat.name} to ${display}. Want me to make that your default version?`
            : `I noticed you often skip ${stat.name} in ${display}. Want me to remember that as your usual version?`,
      }
    }
    return null
  }

  return consider(entry.addedIngredientStats, 'add') ?? consider(entry.removedIngredientStats, 'remove')
}

export async function getPendingEvolutionForRecipe(
  recipeKey: string,
): Promise<PendingEvolution | null> {
  const entry = await getLearningProfile(recipeKey)
  if (!entry) return null
  return findPendingEvolution(entry)
}

export async function resolveEvolutionPrompt(params: {
  recipeKey: string
  ingredient: string
  kind: EvolutionKind
  decision: RecipeEvolutionDecision
}): Promise<void> {
  const entry = await getLearningProfile(params.recipeKey)
  if (!entry?.id) return

  const key = ingredientKey(params.ingredient)
  const name = normalizeIngredient(params.ingredient)
  const decisions = { ...(entry.evolutionDecisions ?? {}), [key]: params.decision }
  const now = new Date().toISOString()
  const patch: Partial<MealLearningEntry> = {
    evolutionDecisions: decisions,
    updatedAt: now,
  }

  if (params.decision === 'accepted') {
    if (params.kind === 'add') {
      patch.defaultAdditions = mergeUniqueNames(entry.defaultAdditions, [name]) ?? [name]
    } else {
      patch.defaultRemovals = mergeUniqueNames(entry.defaultRemovals, [name]) ?? [name]
    }
  }

  await db.mealLearning.update(entry.id, patch)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('haven:recipe-log-updated'))
  }
}

export function formatYourVersionHint(entry: MealLearningEntry | undefined): string | null {
  if (!entry) return null
  const adds = entry.defaultAdditions?.filter(Boolean) ?? []
  const removes = entry.defaultRemovals?.filter(Boolean) ?? []
  if (adds.length === 0 && removes.length === 0) return null
  const parts: string[] = []
  if (adds.length) parts.push(`usually adds ${adds.slice(0, 2).join(' & ')}`)
  if (removes.length) parts.push(`usually skips ${removes.slice(0, 2).join(' & ')}`)
  return `Your version ${parts.join(' · ')}.`
}
