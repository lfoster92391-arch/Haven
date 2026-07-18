import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useScrollToTopOnChange } from '../hooks/useScrollToTopOnChange'
import { format } from 'date-fns'
import { db, type Coupon, type CouponWalletCategory } from '../db/database'
import { useCoupons, useGroceryList, useBudgets, useTransactions, useUserProfile } from '../hooks/useHavenData'
import { useHBISnapshot, useDealAlerts, useShoppingTrips } from '../hooks/useHBI'
import {
  isOnline,
  fetchOnlineDealsForList,
} from '../lib/dealLookup'
import { CouponScanner, type ScanResult } from '../components/CouponScanner'
import { CouponConfirmation, type CouponConfirmationData } from '../components/CouponConfirmation'
import { SmartShoppingMode } from '../components/SmartShoppingMode'
import { ShoppingModeView } from '../components/havenVision/ShoppingModeView'
import {
  parseCouponIntelligence,
  couponLegacyFromStructured,
  type ParsedCoupon,
} from '../lib/couponParser'
import { integrateCouponAfterSave } from '../lib/couponIntegrations'
import { recordTimelineEvent } from '../lib/householdTimeline'
import { addToGroceryList } from '../lib/shoppingIntelligence/groceryListService'
import type { ParseResult } from '../lib/couponIntelligenceParser'
import hbi from '../lib/buyingIntelligence/hbi'
import { Card } from '../components/Card'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { SavingsCommandCenter } from '../components/savings/SavingsCommandCenter'
import { ShoppingIntelligenceView } from '../components/shoppingIntelligence/ShoppingIntelligenceView'
import { useShoppingIntelligence } from '../hooks/useShoppingIntelligence'
import hsie from '../lib/shoppingIntelligence'
import { getTodaysLesson, QUICK_PLAYBOOK, MONEY_MODULES } from '../lib/moneySchool'
import { ResponsiveTabs } from '../components/ui/MobileTabSelect'
import { FilterDropdown } from '../components/ui/FilterDropdown'
import { ActionMenu } from '../components/ui/ActionMenu'
import { BETA_BANNER_COPY, isBetaSimplifiedUi } from '../lib/betaFeatures'
import { openAskHaven } from '../lib/havenChat'
import styles from './Coupons.module.css'

type SavingsTab =
  | 'overview'
  | 'smart-cart'
  | 'trip'
  | 'hidden-savings'
  | 'learn'

const SAVINGS_TABS: { id: SavingsTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'smart-cart', label: 'Smart Cart' },
  { id: 'trip', label: 'Trip' },
  { id: 'hidden-savings', label: 'Hidden Savings' },
  { id: 'learn', label: 'Learn' },
]

const BETA_SAVINGS_TABS: { id: SavingsTab; label: string }[] = [
  { id: 'overview', label: 'Buy / Wait / Skip' },
  { id: 'trip', label: "Today's Trip" },
  { id: 'smart-cart', label: 'Smart Cart' },
  { id: 'hidden-savings', label: 'Coupons & Deals' },
]

const LEGACY_TAB_MAP: Record<string, SavingsTab> = {
  dashboard: 'overview',
  deals: 'hidden-savings',
  coupons: 'hidden-savings',
  shopping: 'trip',
  list: 'trip',
  trips: 'trip',
  prices: 'trip',
  opportunities: 'overview',
}

const WALLET_CATEGORIES: { id: CouponWalletCategory; label: string }[] = [
  { id: 'paper', label: 'Paper' },
  { id: 'digital', label: 'Digital' },
  { id: 'manufacturer', label: 'Manufacturer' },
  { id: 'store', label: 'Store' },
  { id: 'promo', label: 'Promo Codes' },
  { id: 'cashback', label: 'Cashback' },
  { id: 'loyalty', label: 'Loyalty' },
]

export function Coupons() {
  const [searchParams, setSearchParams] = useSearchParams()
  const coupons = useCoupons()
  const groceryList = useGroceryList()
  const hbiSnapshot = useHBISnapshot()
  const shoppingBrief = useShoppingIntelligence()
  const dealAlerts = useDealAlerts()
  const shoppingTrips = useShoppingTrips()
  const budgets = useBudgets()
  const transactions = useTransactions()
  const userProfile = useUserProfile()
  const month = format(new Date(), 'yyyy-MM')
  const beta = isBetaSimplifiedUi()
  const visibleTabs = beta ? BETA_SAVINGS_TABS : SAVINGS_TABS

  const [tab, setTab] = useState<SavingsTab>('overview')
  useScrollToTopOnChange(tab)
  const [showScanner, setShowScanner] = useState(false)
  const [scannerVariant, setScannerVariant] = useState<'coupon' | 'coupon-photo'>('coupon')
  const [ocrReview, setOcrReview] = useState<CouponConfirmationData | null>(null)
  const [ocrLegacy, setOcrLegacy] = useState<Partial<import('../db/database').Coupon> | null>(null)
  const [savingReview, setSavingReview] = useState(false)
  const [showCouponForm, setShowCouponForm] = useState(false)
  const [showGroceryForm, setShowGroceryForm] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [showShoppingMode, setShowShoppingMode] = useState(false)
  const [showVisionShopping, setShowVisionShopping] = useState(false)
  const [missedOpps, setMissedOpps] = useState<Awaited<ReturnType<typeof hbi.findMissedOpportunities>>>([])

  const [title, setTitle] = useState('')
  const [store, setStore] = useState('')
  const [discountType, setDiscountType] = useState<Coupon['discountType']>('percent')
  const [discountValue, setDiscountValue] = useState('10')
  const [products, setProducts] = useState('')
  const [expiration, setExpiration] = useState('')
  const [scannedBarcode, setScannedBarcode] = useState('')
  const [walletCategory, setWalletCategory] = useState<CouponWalletCategory>('paper')
  const [couponWalletFilter, setCouponWalletFilter] = useState<CouponWalletCategory | 'all'>('all')

  const [groceryName, setGroceryName] = useState('')
  const [groceryQty, setGroceryQty] = useState('1')

  useEffect(() => {
    const t = searchParams.get('tab')
    if (!t) return
    const mapped = (LEGACY_TAB_MAP[t] ?? t) as SavingsTab
    if (mapped === 'learn' && isBetaSimplifiedUi()) {
      setTab('overview')
      return
    }
    if (visibleTabs.some(x => x.id === mapped)) setTab(mapped)
  }, [searchParams, beta])

  useEffect(() => {
    hbi.findMissedOpportunities().then(setMissedOpps).catch(console.warn)
  }, [hbiSnapshot?.updatedAt])

  const groceryBudget = budgets?.find(b => b.month === month && b.category === 'Groceries')
  const grocerySpent = transactions?.filter(t => t.date.startsWith(month) && t.category === 'Groceries')
    .reduce((s, t) => s + t.amount, 0) ?? 0

  const cc = hbiSnapshot?.commandCenter

  const displayName = userProfile?.name?.trim() || 'there'

  function refreshShoppingData(trigger: string) {
    hbi.refreshDebounced({ trigger })
    hsie.refreshDebounced({ trigger })
  }

  function switchTab(t: SavingsTab) {
    setTab(t)
    setSearchParams({ tab: t })
  }

  function applyParsedToForm(p: ParsedCoupon | ParseResult['legacy']) {
    const parsed = 'confidence' in (p as ParsedCoupon)
      ? (p as ParsedCoupon)
      : null
    const legacy = parsed ?? (p as ParseResult['legacy'])
    setTitle(legacy.title ?? '')
    setStore(legacy.store ?? '')
    if (legacy.discountType) setDiscountType(legacy.discountType)
    if (legacy.discountValue !== undefined) setDiscountValue(String(legacy.discountValue))
    if (legacy.products) setProducts(legacy.products.join(', '))
    if (legacy.expirationDate) setExpiration(legacy.expirationDate)
    if (legacy.barcode) setScannedBarcode(legacy.barcode)
  }

  async function saveStructuredCoupon(data: CouponConfirmationData) {
    setSavingReview(true)
    try {
      const legacy = couponLegacyFromStructured(data.structured)
      await integrateCouponAfterSave(data.structured, legacy)
      setOcrReview(null)
      setOcrLegacy(null)
    } finally {
      setSavingReview(false)
    }
  }

  function openScanner(variant: 'coupon' | 'coupon-photo') {
    setScannerVariant(variant)
    setOcrReview(null)
    setShowScanner(true)
  }

  async function handleScanResult(result: ScanResult) {
    setShowScanner(false)

    if (result.type === 'barcode' && result.barcode) {
      if (result.intelligenceParse) {
        setOcrReview({
          structured: result.intelligenceParse.structured,
          fieldConfidences: result.intelligenceParse.fieldConfidences,
          validationWarnings: result.intelligenceParse.validationWarnings,
        })
        setOcrLegacy(result.intelligenceParse.legacy)
        switchTab('hidden-savings')
        return
      }
      if (result.product) {
        await db.coupons.add({
          title: result.product.name,
          store: 'Scanned',
          discountType: 'percent',
          discountValue: 0,
          products: [result.product.name, result.product.brand ?? ''].filter(Boolean),
          barcode: result.barcode,
          source: 'scan',
          walletCategory: 'paper',
          used: false,
          createdAt: new Date().toISOString(),
          notes: `Barcode: ${result.barcode}`,
        })
        await addToGroceryList(result.product.name, {
          category: 'Scanned',
          barcode: result.barcode,
        })
        refreshShoppingData('coupon-scan')
      } else {
        setTitle('')
        setStore('')
        setProducts('')
        setExpiration('')
        setScannedBarcode(result.barcode)
        setShowCouponForm(true)
      }
      return
    }

    if (result.intelligenceParse) {
      setOcrReview({
        structured: result.intelligenceParse.structured,
        fieldConfidences: result.intelligenceParse.fieldConfidences,
        validationWarnings: result.intelligenceParse.validationWarnings,
      })
      setOcrLegacy(result.intelligenceParse.legacy)
      switchTab('hidden-savings')
      return
    }

    if (result.parsed) {
      const reparsed = parseCouponIntelligence(result.text ?? result.parsed.rawText ?? '', 'paper')
      setOcrReview({
        structured: reparsed.structured,
        fieldConfidences: reparsed.fieldConfidences,
        validationWarnings: reparsed.validationWarnings,
      })
      setOcrLegacy(reparsed.legacy)
      switchTab('hidden-savings')
    }
  }

  async function saveFromReview() {
    if (!ocrReview) return
    await saveStructuredCoupon(ocrReview)
  }

  function editFromReview() {
    if (!ocrReview || !ocrLegacy) return
    applyParsedToForm(ocrLegacy)
    setOcrReview(null)
    setShowCouponForm(true)
  }

  function retryOcr() {
    setOcrReview(null)
    openScanner('coupon-photo')
  }

  async function handleStructuredSaveFromScanner(data: CouponConfirmationData) {
    await saveStructuredCoupon(data)
    setShowScanner(false)
  }

  async function addCoupon(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await db.coupons.add({
      title: title.trim(),
      store: store.trim() || 'General',
      discountType,
      discountValue: parseFloat(discountValue) || 0,
      products: products.split(',').map(p => p.trim()).filter(Boolean),
      expirationDate: expiration || undefined,
      barcode: scannedBarcode || undefined,
      source: scannedBarcode ? 'scan' : 'manual',
      walletCategory,
      used: false,
      createdAt: new Date().toISOString(),
      notes: scannedBarcode ? `Barcode: ${scannedBarcode}` : undefined,
    })
    resetCouponForm()
    refreshShoppingData('coupon-add')
  }

  function resetCouponForm() {
    setTitle('')
    setStore('')
    setDiscountType('percent')
    setDiscountValue('10')
    setProducts('')
    setExpiration('')
    setScannedBarcode('')
    setWalletCategory('paper')
    setShowCouponForm(false)
  }

  async function addGroceryItem(e: React.FormEvent) {
    e.preventDefault()
    if (!groceryName.trim()) return
    const result = await addToGroceryList(groceryName, {
      category: 'Grocery',
      quantity: parseInt(groceryQty) || 1,
    })
    if (result.added) {
      setGroceryName('')
      setGroceryQty('1')
      setShowGroceryForm(false)
    }
    setLookupError(result.added ? null : result.message)
    refreshShoppingData('grocery-add')
  }

  async function toggleGrocery(id: number, checked: boolean) {
    await db.groceryList.update(id, { checked: !checked })
    refreshShoppingData('grocery-toggle')
  }

  async function deleteGrocery(id: number) {
    await db.groceryList.delete(id)
    refreshShoppingData('grocery-delete')
  }

  async function markCouponUsed(id: number) {
    await db.coupons.update(id, { used: true })
    refreshShoppingData('coupon-used')
  }

  async function deleteCoupon(id: number) {
    await db.coupons.delete(id)
    refreshShoppingData('coupon-delete')
  }

  async function findOnlineDeals() {
    if (!isOnline()) {
      setLookupError('You’ll need a connection for me to look up deals online.')
      return
    }
    setLookingUp(true)
    setLookupError(null)
    try {
      const deals = await fetchOnlineDealsForList(groceryList ?? [], coupons ?? [])
      if (deals.length === 0) {
        setLookupError('I couldn’t find online matches yet. Add a few list items and save a coupon first.')
      } else {
        setLookupError(`I found ${deals.length} online deal${deals.length > 1 ? 's' : ''} — peek at Hidden Savings.`)
        switchTab('hidden-savings')
      }
    } catch {
      setLookupError('Something didn’t go quite as planned fetching deals. Let’s try again later.')
    }
    setLookingUp(false)
  }

  async function completeShoppingTrip() {
    const active = shoppingTrips?.find(t => !t.completed)
    if (active?.id) {
      await db.shoppingTrips.update(active.id, { completed: true })
      const storeNames = active.stores?.map(s => s.name).join(', ') ?? 'stores'
      void recordTimelineEvent({
        category: 'shopping',
        icon: '🛒',
        title: 'Completed shopping trip',
        detail: storeNames,
        source: 'shopping',
        searchableText: `shopping trip ${storeNames}`,
        entityId: `trip-${active.id}`,
        entityType: 'shopping-trip',
      })
    }
    setShowShoppingMode(false)
    hbi.refresh({ trigger: 'trip-complete' }).catch(console.warn)
    hsie.refresh({ trigger: 'trip-complete' }).catch(console.warn)
  }

  const activeCoupons = coupons?.filter(c => !c.used) ?? []
  const uncheckedList = groceryList?.filter(g => !g.checked) ?? []

  return (
    <div className={styles.page}>
      {/* Beta overview: ShoppingBriefHero greets — skip cold page chrome */}
      {!(beta && tab === 'overview') && (
        <PageHeader
          title="Savings"
          subtitle={
            tab === 'overview'
              ? 'What would I do if I were running your house today?'
              : tab === 'trip'
                ? 'What’s worth buying today?'
                : tab === 'smart-cart'
                  ? 'What should go on the list?'
                  : 'Where can you save a little?'
          }
        />
      )}

      {beta && (
        <p className={styles.whisper} role="status">
          {BETA_BANNER_COPY}
        </p>
      )}

      {/* Beta overview: lead with morning briefing so first viewport feels like Home */}
      {beta && tab === 'overview' && shoppingBrief && (
        <ShoppingIntelligenceView
          brief={shoppingBrief}
          displayName={displayName}
          tab="overview"
          onOpenScanner={() => openScanner('coupon')}
        />
      )}
      {beta && tab === 'overview' && !shoppingBrief && hbiSnapshot && (
        <SavingsCommandCenter
          displayName={displayName}
          hbiSnapshot={hbiSnapshot}
          activeCoupons={activeCoupons}
          onSwitchTab={(t) =>
            switchTab(
              t === 'shopping'
                ? 'trip'
                : t === 'deals' || t === 'coupons'
                  ? 'hidden-savings'
                  : (t as SavingsTab),
            )
          }
        />
      )}

      {!beta && (
        <div style={{ marginBottom: '0.85rem' }}>
          <Button
            variant="secondary"
            onClick={() =>
              openAskHaven({
                hint: 'You opened me from Savings — ask where you can save this week, buy/wait/skip, or coupon stacks.',
              })
            }
          >
            Ask Haven where to save
          </Button>
        </div>
      )}

      {!beta && tab !== 'overview' && tab !== 'learn' && tab !== 'hidden-savings' && (
        <p className={styles.schoolNote}>
          Tip: use Scan and your trip list — Smart Money School returns after beta.
        </p>
      )}

      {!(beta && tab === 'overview') && (
        <div className={styles.topActions}>
          <Button onClick={() => openScanner('coupon')}>Scan a coupon</Button>
          <Link to="/scan?mode=product" className={styles.quietLink}>
            Haven Vision
          </Link>
          {uncheckedList.length > 0 && (
            <>
              <Button variant="secondary" onClick={() => setShowShoppingMode(true)}>
                Start shopping
              </Button>
              {!beta && (
                <Button variant="secondary" onClick={() => setShowVisionShopping(true)}>
                  Shopping Mode
                </Button>
              )}
            </>
          )}
          <ActionMenu
            label="More"
            items={[
              { label: 'Take Photo', icon: '📸', onClick: () => openScanner('coupon-photo') },
              { label: 'Add Coupon', icon: '🏷️', onClick: () => { setShowCouponForm(true); switchTab('hidden-savings') } },
              { label: 'Grocery Item', icon: '🛒', onClick: () => setShowGroceryForm(true) },
              { label: lookingUp ? 'Searching…' : 'Find Online Deals', icon: '🌐', onClick: findOnlineDeals },
            ]}
          />
        </div>
      )}

      {beta && tab === 'overview' && (
        <div className={styles.topActionsQuiet}>
          <Button size="sm" variant="secondary" onClick={() => openScanner('coupon')}>
            Scan a coupon
          </Button>
          {uncheckedList.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setShowShoppingMode(true)}>
              Start shopping
            </Button>
          )}
        </div>
      )}

      {!beta && (
        <p className={styles.schoolNote} role="note">
          A quiet tip: clear grocery barcodes and flat coupon codes work best — wrinkled packs are trickier.
        </p>
      )}

      {!isOnline() && (
        <div className={styles.offlineNote}>
          Offline mode — scanned coupons, Buy/Wait/Skip, and list matching still work. Connect to look up deals online.
        </div>
      )}

      {lookupError && <div className={styles.errorBanner}>{lookupError}</div>}

      {cc && tab !== 'overview' && !beta && (
        <div className={styles.headerStats}>
          <span>Today&apos;s Savings <strong>${cc.todaySavings.toFixed(2)}</strong></span>
          <span>Potential Monthly <strong>${cc.potentialMonthly.toFixed(0)}</strong></span>
          {cc.bestStore && <span>Best Store <strong>{cc.bestStore}</strong></span>}
          <span>Savings Score <strong>{cc.savingsScore}</strong></span>
        </div>
      )}

      <ResponsiveTabs
        tabs={visibleTabs.map(t => ({
          id: t.id,
          label: t.label,
          badge:
            t.id === 'hidden-savings' && shoppingBrief
              ? shoppingBrief.hiddenSavings.length || undefined
              : t.id === 'smart-cart' && shoppingBrief
                ? shoppingBrief.commandCenter.buyCount || undefined
                : t.id === 'trip' && uncheckedList.length > 0
                  ? uncheckedList.length
                  : undefined,
        }))}
        active={tab}
        onChange={switchTab}
        mobileLabel="Shopping section"
        ariaLabel="Smart shopping sections"
        tabsClassName={styles.tabs}
        tabClassName={styles.tab}
        tabActiveClassName={styles.tabActive}
      />

      {!beta && tab === 'overview' && shoppingBrief && (
        <ShoppingIntelligenceView
          brief={shoppingBrief}
          displayName={displayName}
          tab="overview"
          onOpenScanner={() => openScanner('coupon')}
        />
      )}

      {!beta && tab === 'overview' && !shoppingBrief && hbiSnapshot && (
        <SavingsCommandCenter
          displayName={displayName}
          hbiSnapshot={hbiSnapshot}
          activeCoupons={activeCoupons}
          onSwitchTab={(t) => switchTab(t === 'shopping' ? 'trip' : t === 'deals' || t === 'coupons' ? 'hidden-savings' : t as SavingsTab)}
        />
      )}

      {tab === 'smart-cart' && shoppingBrief && (
        <ShoppingIntelligenceView brief={shoppingBrief} displayName={displayName} tab="smart-cart" />
      )}

      {tab === 'hidden-savings' && (
        <>
          {shoppingBrief && (
            <ShoppingIntelligenceView
              brief={shoppingBrief}
              displayName={displayName}
              tab="hidden-savings"
              onOpenScanner={() => openScanner('coupon')}
            />
          )}

          {ocrReview && (
            <CouponConfirmation
              data={ocrReview}
              onSave={saveFromReview}
              onEditSave={async () => { editFromReview() }}
              onRescan={retryOcr}
              saving={savingReview}
            />
          )}

          {showCouponForm && (
            <Card>
              <form onSubmit={addCoupon} className={styles.form}>
                {scannedBarcode && (
                  <p className={styles.barcodeBanner}>✓ Barcode: <strong>{scannedBarcode}</strong></p>
                )}
                <input className={styles.input} placeholder="Coupon title" value={title} onChange={e => setTitle(e.target.value)} required />
                <div className={styles.formRow}>
                  <input className={styles.input} placeholder="Store" value={store} onChange={e => setStore(e.target.value)} />
                  <select className={styles.select} value={walletCategory} onChange={e => setWalletCategory(e.target.value as CouponWalletCategory)}>
                    {WALLET_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className={styles.formRow}>
                  <select className={styles.select} value={discountType} onChange={e => setDiscountType(e.target.value as Coupon['discountType'])}>
                    <option value="percent">% Off</option>
                    <option value="fixed">$ Off</option>
                    <option value="bogo">BOGO</option>
                    <option value="free">Free</option>
                  </select>
                  <input className={styles.input} type="number" placeholder="Value" value={discountValue} onChange={e => setDiscountValue(e.target.value)} />
                </div>
                <input className={styles.input} placeholder="Products (comma-separated)" value={products} onChange={e => setProducts(e.target.value)} />
                <input className={styles.input} type="date" value={expiration} onChange={e => setExpiration(e.target.value)} />
                <div className={styles.formRow}>
                  <Button type="submit">Save Coupon</Button>
                  <Button variant="ghost" type="button" onClick={resetCouponForm}>Cancel</Button>
                </div>
              </form>
            </Card>
          )}

          <Card title="Coupon Wallet (feeds Hidden Savings)">
            <FilterDropdown
              label="Wallet category"
              mobileOnly={false}
              compactOnDesktop
              value={couponWalletFilter}
              onChange={setCouponWalletFilter}
              options={[
                { id: 'all', label: 'All categories', count: activeCoupons.length },
                ...WALLET_CATEGORIES.map(c => ({
                  id: c.id,
                  label: c.label,
                  count: activeCoupons.filter(x => x.walletCategory === c.id).length,
                })),
              ]}
            />
            {activeCoupons.length === 0 ? (
              <p className={styles.empty}>Scan or add a coupon and I’ll keep it ready for your trip.</p>
            ) : (
              <ul className={styles.couponList}>
                {activeCoupons
                  .filter(c => couponWalletFilter === 'all' || c.walletCategory === couponWalletFilter)
                  .map(c => (
                  <li key={c.id} className={styles.couponItem}>
                    <div className={styles.couponInfo}>
                      <strong>{c.title}</strong>
                      <span className={styles.badge}>{c.store}</span>
                      {c.productName && <span className={styles.badge}>{c.productName}</span>}
                      {c.brand && <span className={styles.badge}>{c.brand}</span>}
                      {c.parseConfidence != null && (
                        <span className={styles.badge}>{Math.round(c.parseConfidence * 100)}% parsed</span>
                      )}
                      {c.expirationDate && (
                        <span className={styles.expDate}>Exp. {format(new Date(c.expirationDate), 'MMM d')}</span>
                      )}
                    </div>
                    <div className={styles.couponActions}>
                      <Button size="sm" variant="secondary" onClick={() => c.id && markCouponUsed(c.id)}>Used</Button>
                      <button type="button" className={styles.deleteBtn} onClick={() => c.id && deleteCoupon(c.id)}>×</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {tab === 'trip' && (
        <>
          {shoppingBrief && (
            <ShoppingIntelligenceView brief={shoppingBrief} displayName={displayName} tab="trip" />
          )}

          <div className={styles.topActions} style={{ marginTop: 0 }}>
            {uncheckedList.length > 0 && (
              <Button variant="secondary" onClick={() => setShowShoppingMode(true)}>
                🛒 Start Shopping Mode
              </Button>
            )}
            <Button variant="ghost" onClick={() => setShowGroceryForm(true)}>Add Item</Button>
          </div>

          {showGroceryForm && (
            <Card>
              <form onSubmit={addGroceryItem} className={styles.form}>
                <div className={styles.formRow}>
                  <input className={styles.input} placeholder="Item name" value={groceryName} onChange={e => setGroceryName(e.target.value)} required />
                  <input className={styles.input} type="number" min="1" placeholder="Qty" value={groceryQty} onChange={e => setGroceryQty(e.target.value)} />
                  <Button type="submit">Add to List</Button>
                </div>
              </form>
            </Card>
          )}

          <Card title="Grocery List">
            {uncheckedList.length === 0 ? (
              <p className={styles.empty}>Your list is quiet for now. Add what you need and I’ll help shape the trip.</p>
            ) : (
              <ul className={styles.groceryList}>
                {groceryList?.map(item => (
                  <li key={item.id} className={`${styles.groceryItem} ${item.checked ? styles.checked : ''}`}>
                    <label className={styles.checkbox}>
                      <input type="checkbox" checked={item.checked} onChange={() => item.id && toggleGrocery(item.id, item.checked)} />
                      <span>{item.name}</span>
                    </label>
                    <span className={styles.qty}>{item.quantity} {item.unit}</span>
                    <button type="button" className={styles.deleteBtn} onClick={() => item.id && deleteGrocery(item.id)}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {tab === 'learn' && !beta && (
        <>
          <Card title="Today's Lesson">
            {(() => {
              const today = getTodaysLesson()
              return (
                <>
                  <p className={styles.lessonModule}>{today.module.icon} {today.module.title}</p>
                  <h4 className={styles.lessonTitle}>{today.lesson.title}</h4>
                  <p className={styles.lessonBody}>{today.lesson.body}</p>
                  {today.lesson.action && today.lesson.actionPath && (
                    <Link to={today.lesson.actionPath} className={styles.lessonAction}>
                      {today.lesson.action} →
                    </Link>
                  )}
                </>
              )
            })()}
          </Card>

          <Card title="Quick Playbook">
            <ul className={styles.playbookList}>
              {QUICK_PLAYBOOK.map((step, i) => (
                <li key={i}>{step.icon} {step.text}</li>
              ))}
            </ul>
          </Card>

          <Card title="All Modules">
            <ul className={styles.moduleList}>
              {MONEY_MODULES.map(m => (
                <li key={m.id}>
                  <strong>{m.icon} {m.title}</strong>
                  <span className={styles.moduleSub}>{m.subtitle}</span>
                </li>
              ))}
            </ul>
            <p className={styles.fullSchoolLink} style={{ opacity: 0.75, cursor: 'default' }}>
              Full Smart Money School returns after beta.
            </p>
          </Card>

          {missedOpps.length > 0 && (
            <Card title="Money You're Leaving on the Table">
              <ul className={styles.oppList}>
                {missedOpps.map((o, i) => (
                  <li key={i}>
                    <strong>{o.title}</strong>
                    <p>{o.description}</p>
                    {o.estimatedMonthly != null && (
                      <span className={styles.oppSavings}>~${o.estimatedMonthly.toFixed(0)}/mo potential</span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {showScanner && (
        <CouponScanner
          variant={scannerVariant}
          source="paper"
          onResult={handleScanResult}
          onStructuredSave={handleStructuredSaveFromScanner}
          onClose={() => setShowScanner(false)}
        />
      )}

      {showShoppingMode && (
        <SmartShoppingMode
          groceryList={groceryList ?? []}
          coupons={coupons ?? []}
          dealAlerts={dealAlerts ?? []}
          budgetLimit={groceryBudget?.monthlyLimit}
          budgetSpent={grocerySpent}
          onComplete={completeShoppingTrip}
          onClose={() => setShowShoppingMode(false)}
        />
      )}

      {showVisionShopping && (
        <ShoppingModeView onClose={() => setShowVisionShopping(false)} />
      )}
    </div>
  )
}
