import type { GamePlanCard } from '../householdCommandCenter'
import { getUseFirstItems } from '../kitchenSummary'
import { countMealsAvailable } from './pantryIntelligence'
import type { ShoppingIntelligenceInputs } from './types'

/**
 * Game Plan strip for Savings briefing — same COOK/BUY/WAIT/USE/SAVE language as Home.
 */
export function buildSavingsGamePlan(inputs: ShoppingIntelligenceInputs): GamePlanCard[] {
  const cards: GamePlanCard[] = []
  const ref = inputs.reference
  const hbi = inputs.hbiSnapshot

  const meals = countMealsAvailable(inputs)
  if (meals > 0) {
    cards.push({
      kind: 'cook',
      label: 'Cook',
      title: meals === 1 ? 'Dinner from what you have' : `${meals} dinners on hand`,
      note: 'Start in the kitchen before the store',
      actionLabel: 'Open Kitchen',
      path: '/kitchen',
      featured: true,
    })
  }

  const buy = hbi.buyToday?.[0]
  if (buy) {
    cards.push({
      kind: 'buy',
      label: 'Buy',
      title: buy.productName,
      note: buy.reason || buy.stockNote || (buy.bestStore ? `Best at ${buy.bestStore}` : 'When you are already out'),
      actionLabel: 'Add to list',
      path: '/savings?tab=smart-cart',
    })
  }

  const wait = hbi.waitList?.[0] ?? hbi.skipList?.[0]
  if (wait) {
    cards.push({
      kind: 'wait',
      label: wait === hbi.skipList?.[0] ? 'Skip' : 'Wait',
      title: wait.productName,
      note: wait.reason || wait.stockNote || 'You can hold off for now',
      actionLabel: 'See why',
      path: '/savings?tab=smart-cart',
    })
  }

  const useFirst = getUseFirstItems(inputs.pantry, 1, ref)[0]
  if (useFirst) {
    cards.push({
      kind: 'use',
      label: 'Use',
      title: useFirst.name,
      note: useFirst.daysLeft <= 1 ? `Expires ${useFirst.daysLabel.toLowerCase()}` : useFirst.daysLabel,
      actionLabel: 'Find recipes',
      path: '/kitchen',
    })
  }

  const savings =
    hbi.commandCenter.todaySavings ||
    hbi.commandCenter.potentialMonthly ||
    0
  if (savings >= 3) {
    cards.push({
      kind: 'save',
      label: 'Save',
      title: `About $${Math.round(savings)}`,
      note: hbi.commandCenter.bestStore
        ? `Possible around ${hbi.commandCenter.bestStore}`
        : 'Estimated from your deals and list',
      actionLabel: 'See trip',
      path: '/savings?tab=trip',
    })
  }

  return cards.slice(0, 5)
}
