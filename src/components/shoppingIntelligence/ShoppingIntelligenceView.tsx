import { DashboardFramework } from '../shared/DashboardFramework'
import { isBetaSimplifiedUi } from '../../lib/betaFeatures'
import { ShoppingBriefHero } from './ShoppingBriefHero'
import { ShoppingCommandCenter } from './ShoppingCommandCenter'
import { TodaysTripCard } from './TodaysTripCard'
import { SmartCartList } from './SmartCartList'
import { HiddenSavingsCard } from './HiddenSavingsCard'
import { PantryIntelligencePanel } from './PantryIntelligencePanel'
import { HouseholdSupplyForecast } from './HouseholdSupplyForecast'
import { PriceMemoryCard } from './PriceMemoryCard'
import { SeasonalShoppingBanner } from './SeasonalShoppingBanner'
import { ReceiptBrainInsight } from './ReceiptBrainInsight'
import { ShoppingInsightCard } from './ShoppingInsightCard'
import { GamePlanSection } from '../householdCommandCenter/HomeVisionSections'
import styles from './shoppingIntelligence.module.css'
import type { ShoppingIntelligenceBrief } from '../../lib/shoppingIntelligence/types'

export type ShoppingTab = 'overview' | 'smart-cart' | 'trip' | 'hidden-savings' | 'learn'

export interface ShoppingIntelligenceViewProps {
  brief: ShoppingIntelligenceBrief
  displayName: string
  tab: ShoppingTab
  onOpenScanner?: () => void
}

export function ShoppingIntelligenceView({
  brief,
  displayName,
  tab,
  onOpenScanner,
}: ShoppingIntelligenceViewProps) {
  const beta = isBetaSimplifiedUi()

  if (tab === 'smart-cart') {
    return (
      <div className={styles.view}>
        <SmartCartList items={brief.smartCart} />
      </div>
    )
  }

  if (tab === 'trip') {
    return (
      <div className={styles.view}>
        {brief.todaysTrip ? (
          <TodaysTripCard trip={brief.todaysTrip} />
        ) : (
          <p className={styles.empty}>Add grocery list items — Haven will build your trip.</p>
        )}
        {!beta && <PriceMemoryCard entries={brief.priceMemory} />}
        {beta && brief.pantryIntelligence.length > 0 && (
          <PantryIntelligencePanel items={brief.pantryIntelligence.slice(0, 6)} />
        )}
      </div>
    )
  }

  if (tab === 'hidden-savings') {
    return (
      <div className={styles.view}>
        <HiddenSavingsCard
          combos={brief.hiddenSavings}
          betaEmptyHint={beta}
        />
        {onOpenScanner && (
          <p className={styles.scannerNote}>
            Have a coupon?{' '}
            <button type="button" onClick={onOpenScanner}>Scan it</button>
            {beta ? ' — then finish your trip list.' : ' — savings appear here, not as a list.'}
          </p>
        )}
      </div>
    )
  }

  // Overview — morning briefing + Game Plan, then buy/wait/skip decisions.
  return (
    <DashboardFramework className={styles.view}>
      <ShoppingBriefHero brief={brief.morningBrief} />

      <GamePlanSection cards={brief.gamePlan ?? []} />

      {!beta && <ShoppingCommandCenter stats={brief.commandCenter} displayName={displayName} />}
      {!beta && <SeasonalShoppingBanner deals={brief.seasonalDeals} />}

      {brief.topInsights.length > 0 && (
        <section className={styles.insightsSection} aria-label="Top shopping insights">
          <h3 className={styles.insightsTitle}>{beta ? 'Buy · Wait · Skip' : 'Decisions that matter'}</h3>
          {brief.topInsights.map((ins, i) => (
            <ShoppingInsightCard key={i} insight={ins} />
          ))}
        </section>
      )}

      {brief.todaysTrip && <TodaysTripCard trip={brief.todaysTrip} />}
      <SmartCartList items={brief.smartCart.slice(0, beta ? 8 : 6)} />
      <PantryIntelligencePanel items={brief.pantryIntelligence} />

      {!beta && (
        <>
          <HiddenSavingsCard combos={brief.hiddenSavings.slice(0, 2)} />
          <HouseholdSupplyForecast items={brief.householdSupply} />
          <PriceMemoryCard entries={brief.priceMemory} />
          <ReceiptBrainInsight insights={brief.receiptInsights} />
        </>
      )}

      {beta && brief.hiddenSavings.length > 0 && (
        <HiddenSavingsCard combos={brief.hiddenSavings.slice(0, 2)} />
      )}
    </DashboardFramework>
  )
}
