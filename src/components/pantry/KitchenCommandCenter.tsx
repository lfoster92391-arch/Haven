import { useMemo, useState } from 'react'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { GroceryListItem, PantryItem } from '../../db/database'
import type { KitchenDashboardMetrics } from '../../lib/kitchenEngine'
import type { OutcomeStats, KitchenSummaryBullets } from '../../lib/kitchenSummary'
import type { KitchenAdvice } from '../../lib/kitchenAdvisor'
import type { MealMatch, MissionControlData } from '../../lib/mealEngine'
import type { MealSuggestion } from '../../lib/mealSuggestionEngine'
import { confidenceBadge } from '../../lib/shelfLifeEstimates'
import { FilterDropdown } from '../ui/FilterDropdown'
import { ActionMenu } from '../ui/ActionMenu'
import { isBetaSimplifiedUi } from '../../lib/betaFeatures'
import { KitchenAssistantHero } from '../kitchen/KitchenAssistantHero'
import { MorningKitchenBrief } from './MorningKitchenBrief'
import { KitchenHealthHero } from './KitchenHealthHero'
import { TonightsMatches } from './TonightsMatches'
import { RecipeLog } from './RecipeLog'
import { ShowHavenKitchen } from './ShowHavenKitchen'
import { StorageSummary } from './StorageSummary'
import { PantryInsightCard } from './PantryInsightCard'
import styles from './KitchenCommandCenter.module.css'

const INVENTORY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'fridge', label: 'Fridge' },
  { id: 'freezer', label: 'Freezer' },
  { id: 'pantry', label: 'Pantry' },
  { id: 'spice', label: 'Spices' },
]

function estimateGroceryCost(list: GroceryListItem[]): number {
  return Math.round(
    list
      .filter(g => !g.checked)
      .reduce((sum, g) => sum + (g.estimatedPrice ?? 4.25) * g.quantity, 0),
  )
}

function itemStatusDot(item: PantryItem, ref = new Date()): string {
  if (item.quantity <= item.lowStockThreshold) return '🟡'
  if (!item.expirationDate) return '⚪'
  const days = differenceInCalendarDays(parseISO(item.expirationDate), ref)
  if (days < 0) return '🔴'
  if (days <= 3) return '🟠'
  if (days <= 7) return '🟡'
  return '🟢'
}

export interface KitchenCommandCenterProps {
  items: PantryItem[]
  dashboard: KitchenDashboardMetrics
  outcomes: OutcomeStats
  kitchenSummary: KitchenSummaryBullets
  mission: MissionControlData | null
  expiredCount: number
  pantryValue: number
  groceryList: GroceryListItem[]
  rankedMeals: MealMatch[]
  tonightOptions?: MealSuggestion[]
  adviceList: KitchenAdvice[]
  userName?: string
  onReviewPantry: () => void
  onOpenShopping: () => void
  onOpenMeals: () => void
  onSelectMeal: (meal: MealMatch) => void
  onAddItem: () => void
  onScan: () => void
  onImportReceipt: () => void
  onMoveItem: () => void
  onCreateShoppingList: () => void
  onExploreArea: (areaId: string) => void
  onExploreVirtual: () => void
}

export function KitchenCommandCenter({
  items,
  dashboard,
  outcomes,
  kitchenSummary,
  mission,
  expiredCount,
  pantryValue,
  groceryList,
  rankedMeals,
  tonightOptions,
  adviceList,
  userName,
  onReviewPantry,
  onOpenShopping,
  onOpenMeals,
  onSelectMeal,
  onAddItem,
  onScan,
  onImportReceipt,
  onMoveItem,
  onCreateShoppingList,
  onExploreArea,
  onExploreVirtual,
}: KitchenCommandCenterProps) {
  const beta = isBetaSimplifiedUi()
  const [locationFilter, setLocationFilter] = useState('all')
  const [search, setSearch] = useState('')

  const foodItems = useMemo(
    () => items.filter(i => i.location !== 'spice' && i.quantity > 0),
    [items],
  )
  const spiceItems = useMemo(
    () => items.filter(i => i.location === 'spice' && i.quantity > 0),
    [items],
  )

  const storageAreas = useMemo(() => [
    { id: 'fridge', icon: '🧊', label: 'Fridge', count: foodItems.filter(i => i.location === 'fridge').length },
    { id: 'freezer', icon: '❄️', label: 'Freezer', count: foodItems.filter(i => i.location === 'freezer').length },
    { id: 'pantry', icon: '🏠', label: 'Pantry', count: foodItems.filter(i => i.location === 'pantry').length },
    { id: 'spices', icon: '🧂', label: 'Spices', count: spiceItems.length },
  ], [foodItems, spiceItems])

  const tonightMatches = useMemo((): MealSuggestion[] => {
    if (tonightOptions && tonightOptions.length > 0) return tonightOptions
    const ready = rankedMeals.filter(m => m.canMake)
    const pool = ready.length > 0 ? ready : rankedMeals
    return pool.slice(0, 8).map(m => ({
      ...m,
      source: m.builtin ? 'haven-library' as const : m.recipeId ? 'cookbook' as const : 'pantry-composed' as const,
      sourceLabel: m.builtin ? 'Haven suggestion' : m.recipeId ? 'Your recipe' : 'From your pantry',
    }))
  }, [rankedMeals, tonightOptions])

  const bestRecipe = mission?.tonightBest ?? dashboard.recommendedDinner ?? dashboard.topRecipe ?? tonightMatches[0]

  const uncheckedGrocery = groceryList.filter(g => !g.checked)
  const groceryCost = estimateGroceryCost(groceryList)

  const filteredInventory = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items
      .filter(i => i.quantity > 0)
      .filter(i => {
        if (locationFilter === 'all') return true
        if (locationFilter === 'spice') return i.location === 'spice'
        return i.location === locationFilter
      })
      .filter(i => !q || i.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12)
  }, [items, locationFilter, search])

  const quickActionItems = [
    { label: 'Add Item', icon: '➕', onClick: onAddItem },
    { label: 'Show Haven', icon: '📷', onClick: onScan },
    { label: 'Import Receipt', icon: '🧾', onClick: onImportReceipt },
    { label: 'Move Item', icon: '📦', onClick: onMoveItem },
    { label: 'Create Shopping List', icon: '➕', onClick: onCreateShoppingList },
  ]

  return (
    <div className={styles.center}>
      {beta ? (
        <KitchenAssistantHero
          userName={userName}
          primary={bestRecipe ?? null}
          moreCount={tonightMatches.length}
          useSoonCount={outcomes.expiringThisWeek}
          onCook={onSelectMeal}
          onSeeMore={onOpenMeals}
        />
      ) : (
        <MorningKitchenBrief
          userName={userName}
          dashboard={dashboard}
          outcomes={outcomes}
          expiredCount={expiredCount}
          pantryValue={pantryValue}
          bestRecipe={bestRecipe}
        />
      )}

      {!beta && (
        <KitchenHealthHero
          dashboard={dashboard}
          outcomes={outcomes}
          expiredCount={expiredCount}
          onReviewPantry={onReviewPantry}
        />
      )}

      <TonightsMatches
        meals={tonightMatches}
        onSelectMeal={onSelectMeal}
        onViewAll={onOpenMeals}
      />

      <RecipeLog />

      <ShowHavenKitchen />

      {!beta && <StorageSummary areas={storageAreas} onSelectArea={onExploreArea} />}

      <section className={styles.shopping} aria-label="Shopping list">
        <div className={styles.shoppingHeader}>
          <h3 className={styles.shoppingTitle}>
            🛒 Shopping List — {uncheckedGrocery.length} Item{uncheckedGrocery.length === 1 ? '' : 's'}
          </h3>
        </div>
        {uncheckedGrocery.length > 0 && (
          <p className={styles.shoppingCost}>Estimated Cost ${groceryCost}</p>
        )}
        <button type="button" className={styles.shoppingBtn} onClick={onOpenShopping}>
          Open Shopping →
        </button>
      </section>

      <div className={`${styles.quickActions} ${styles.quickDesktop}`}>
        {quickActionItems.map(action => (
          <button
            key={action.label}
            type="button"
            className={styles.quickBtn}
            onClick={action.onClick}
          >
            {action.icon} {action.label}
          </button>
        ))}
      </div>
      <div className={styles.quickMobile}>
        <ActionMenu label="Quick Actions" items={quickActionItems} />
      </div>

      {!beta && <PantryInsightCard adviceList={adviceList} summary={kitchenSummary} />}

      <section className={styles.inventory} aria-label={beta ? 'In your kitchen' : 'Inventory'}>
        <div className={styles.inventoryHeader}>
          <h3 className={styles.inventoryTitle}>{beta ? 'Running low & on hand' : 'Inventory'}</h3>
          {!beta && (
            <button type="button" className={styles.exploreLink} onClick={onExploreVirtual}>
              Explore visually →
            </button>
          )}
        </div>

        <div className={styles.inventoryControls}>
          <FilterDropdown
            label="Filter"
            value={locationFilter}
            onChange={setLocationFilter}
            options={INVENTORY_FILTERS}
          />
          <input
            className={styles.search}
            type="search"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label={beta ? 'Search your kitchen' : 'Search inventory'}
          />
        </div>

        {filteredInventory.length === 0 ? (
          <p className={styles.empty}>
            {items.length === 0
              ? 'Your kitchen is quiet for now — scan a grocery barcode or tap Add Item.'
              : 'Nothing matches that filter — try another look.'}
          </p>
        ) : (
          <ul className={styles.inventoryList}>
            {filteredInventory.map(item => {
              const badge = confidenceBadge(item.expirationConfidence)
              return (
                <li key={item.id ?? item.name} className={styles.inventoryItem}>
                  <span className={styles.statusDot} aria-hidden>
                    {itemStatusDot(item)}
                  </span>
                  <span className={styles.itemName}>
                    {item.location === 'spice' ? '🧂 ' : ''}{item.name}
                  </span>
                  <span className={styles.itemMeta}>
                    {item.expirationDate
                      ? format(parseISO(item.expirationDate), 'MMM d')
                      : badge.label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
