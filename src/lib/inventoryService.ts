import { addDays, format, parseISO } from 'date-fns'
import {
  db,
  type InventoryEvent,
  type LifecycleStage,
  type PantryItem,
  type PantryLocation,
  type StorageLocation,
} from '../db/database'
import { enrichPantryItem } from './hfip/adapters/pantryAdapter'
import { hfip } from './hfip'
import hie from './intelligence/hie'
import { mealEngine } from './mealEngine'
import { normalizeItemName } from './pantryAutomation'
import { estimateShelfLifeFromPurchase } from './shelfLifeEstimates'
import { recordUsageEvent } from './usageLearning'
import { recordTimelineEvent } from './householdTimeline'
import { buildInventorySnapshot, matchRecipeIngredients } from './ingredientMatcher'

export function locationToStorage(location: PantryLocation): StorageLocation {
  switch (location) {
    case 'fridge': return 'refrigerator'
    case 'spice': return 'spices'
    case 'baking': return 'baking'
    case 'snacks': return 'snacks'
    case 'drinks': return 'drinks'
    case 'pet-food': return 'pet-food'
    case 'freezer': return 'freezer'
    default: return 'pantry'
  }
}

export function storageToLocation(storage: StorageLocation): PantryLocation {
  switch (storage) {
    case 'refrigerator': return 'fridge'
    case 'spices': return 'spice'
    case 'baking': return 'baking'
    case 'snacks': return 'snacks'
    case 'drinks': return 'drinks'
    case 'pet-food': return 'pet-food'
    case 'freezer': return 'freezer'
    default: return 'pantry'
  }
}

export function inferLifecycleStage(item: PantryItem, ref = new Date()): LifecycleStage {
  if (item.lifecycleStage === 'discarded' || item.lifecycleStage === 'used') return item.lifecycleStage
  if (item.quantity <= 0) return 'used'
  if (item.location === 'freezer' || item.lifecycleStage === 'frozen') return 'frozen'
  if (item.quantity <= item.lowStockThreshold) return 'running-low'
  if (item.expirationDate) {
    const exp = parseISO(item.expirationDate)
    if (exp < ref) return 'expired'
    const days = Math.ceil((exp.getTime() - ref.getTime()) / 86400000)
    if (days <= 7) return 'use-soon'
  }
  return item.lifecycleStage ?? 'stored'
}

export async function recordInventoryEvent(
  event: Omit<InventoryEvent, 'id' | 'createdAt'> & { createdAt?: string },
): Promise<number> {
  const id = await db.inventoryEvents.add({
    ...event,
    createdAt: event.createdAt ?? new Date().toISOString(),
  })

  const icons: Record<string, string> = {
    added: '📦', purchased: '🛒', used: '✓', expired: '⚠️',
    discarded: '🗑️', frozen: '❄️', moved: '↔️', donated: '💚', restocked: '📦',
  }
  void recordTimelineEvent({
    category: 'pantry',
    icon: icons[event.type] ?? '📦',
    title: `${event.type} ${event.itemName ?? 'item'}`,
    detail: event.note,
    source: 'pantry',
    searchableText: `${event.itemName ?? ''} ${event.type} pantry`,
    entityId: `inv-event-${id}`,
    entityType: 'inventory-event',
    timestamp: event.createdAt ?? new Date().toISOString(),
    metadata: { itemId: event.itemId, eventType: event.type },
  })

  return id as number
}

export interface AddPantryItemInput {
  name: string
  location: PantryLocation
  category: string
  quantity: number
  unit: string
  expirationDate?: string
  expirationConfidence?: PantryItem['expirationConfidence']
  purchaseDate?: string
  barcode?: string
  brand?: string
  packageSize?: string
  upc?: string
  shelfLifeDays?: number
  lifecycleStage?: LifecycleStage
}

export async function addPantryItem(data: AddPantryItemInput): Promise<{ id: number; name: string; merged: boolean }> {
  const existing = await db.pantryItems.toArray()
  const match = existing.find(
    item =>
      (data.barcode && item.barcode === data.barcode) ||
      (normalizeItemName(item.name) === normalizeItemName(data.name) && item.location === data.location),
  )

  const today = data.purchaseDate ?? format(new Date(), 'yyyy-MM-dd')
  const storageLocation = locationToStorage(data.location)
  const lifecycleStage = data.lifecycleStage ?? 'stored'

  const ontologyId = hfip.linkOntologyId({ name: data.name } as PantryItem)

  if (match?.id) {
    const newQty = match.quantity + data.quantity
    await db.pantryItems.update(match.id, {
      quantity: newQty,
      purchaseDate: today,
      category: data.category,
      barcode: data.barcode ?? match.barcode,
      expirationDate: data.expirationDate ?? match.expirationDate,
      expirationConfidence: data.expirationConfidence ?? match.expirationConfidence ?? 'estimated',
      unit: data.unit,
      brand: data.brand ?? match.brand,
      packageSize: data.packageSize ?? match.packageSize,
      upc: data.upc ?? match.upc,
      shelfLifeDays: data.shelfLifeDays ?? match.shelfLifeDays,
      storageLocation,
      lifecycleStage: inferLifecycleStage({ ...match, quantity: newQty, lifecycleStage }),
      ontologyId: ontologyId ?? match.ontologyId,
    })
    await recordInventoryEvent({
      itemId: match.id,
      itemName: match.name,
      type: 'restocked',
      quantity: data.quantity,
      toLocation: data.location,
      note: `Restocked to ${newQty} ${data.unit}`,
    })
    await recordUsageEvent(match.name, 'restocked')
    hie.refreshDebounced({ trigger: 'kitchen-updated', module: 'kitchen' })
    mealEngine.refreshDebounced({ trigger: 'manual-add' })
    return { id: match.id, name: match.name, merged: true }
  }

  const id = await db.pantryItems.add(enrichPantryItem({
    name: data.name,
    location: data.location,
    quantity: data.quantity,
    unit: data.unit,
    lowStockThreshold: 1,
    category: data.category,
    purchaseDate: today,
    expirationDate: data.expirationDate,
    expirationConfidence: data.expirationConfidence ?? (data.expirationDate ? 'estimated' : 'unknown'),
    barcode: data.barcode,
    brand: data.brand,
    packageSize: data.packageSize,
    upc: data.upc,
    shelfLifeDays: data.shelfLifeDays,
    storageLocation,
    lifecycleStage,
    ontologyId,
  }))

  await recordInventoryEvent({
    itemId: id as number,
    itemName: data.name,
    type: 'added',
    quantity: data.quantity,
    toLocation: data.location,
    note: 'Added to inventory',
  })
  await recordUsageEvent(data.name, 'added')
  hie.refreshDebounced({ trigger: 'kitchen-updated', module: 'kitchen' })
  mealEngine.refreshDebounced({ trigger: 'manual-add' })
  return { id: id as number, name: data.name, merged: false }
}

export async function deletePantryItem(id: number): Promise<void> {
  const item = await db.pantryItems.get(id)
  if (!item) return
  await recordInventoryEvent({
    itemId: id,
    itemName: item.name,
    type: 'discarded',
    quantity: item.quantity,
    fromLocation: item.location,
    note: 'Removed from inventory',
  })
  await db.pantryItems.delete(id)
  hie.refreshDebounced({ trigger: 'kitchen-updated', module: 'kitchen' })
  mealEngine.refreshDebounced({ trigger: 'grocery-deletion' })
}

export type BatchAction =
  | 'mark-used'
  | 'freeze'
  | 'discard'
  | 'donate'
  | 'extend-date'
  | 'move'
  | 'update-qty'

export async function applyBatchAction(
  itemIds: number[],
  action: BatchAction,
  options?: { newLocation?: PantryLocation; newQuantity?: number; extendDays?: number },
): Promise<void> {
  for (const id of itemIds) {
    const item = await db.pantryItems.get(id)
    if (!item) continue

    switch (action) {
      case 'mark-used': {
        await db.pantryItems.update(id, { quantity: 0, lifecycleStage: 'used' })
        await recordInventoryEvent({ itemId: id, itemName: item.name, type: 'used', quantity: item.quantity })
        await recordUsageEvent(item.name, 'used')
        break
      }
      case 'freeze': {
        await db.pantryItems.update(id, {
          location: 'freezer',
          storageLocation: 'freezer',
          lifecycleStage: 'frozen',
        })
        await recordInventoryEvent({
          itemId: id,
          itemName: item.name,
          type: 'frozen',
          fromLocation: item.location,
          toLocation: 'freezer',
        })
        break
      }
      case 'discard': {
        await db.pantryItems.update(id, { quantity: 0, lifecycleStage: 'discarded' })
        await recordInventoryEvent({
          itemId: id,
          itemName: item.name,
          type: 'discarded',
          quantity: item.quantity,
          note: 'Discarded',
        })
        await recordUsageEvent(item.name, 'discarded')
        break
      }
      case 'donate': {
        await db.pantryItems.update(id, { quantity: 0, lifecycleStage: 'discarded' })
        await recordInventoryEvent({
          itemId: id,
          itemName: item.name,
          type: 'donated',
          quantity: item.quantity,
          note: 'Donated',
        })
        break
      }
      case 'extend-date': {
        const days = options?.extendDays ?? 3
        const base = item.expirationDate ? parseISO(item.expirationDate) : new Date()
        const newDate = format(addDays(base, days), 'yyyy-MM-dd')
        await db.pantryItems.update(id, {
          expirationDate: newDate,
          expirationConfidence: 'verified',
          lifecycleStage: 'stored',
        })
        await recordInventoryEvent({
          itemId: id,
          itemName: item.name,
          type: 'restocked',
          note: `Extended expiration by ${days} days`,
        })
        break
      }
      case 'move': {
        const loc = options?.newLocation ?? item.location
        await db.pantryItems.update(id, {
          location: loc,
          storageLocation: locationToStorage(loc),
        })
        await recordInventoryEvent({
          itemId: id,
          itemName: item.name,
          type: 'moved',
          fromLocation: item.location,
          toLocation: loc,
        })
        break
      }
      case 'update-qty': {
        const qty = options?.newQuantity ?? item.quantity
        await db.pantryItems.update(id, {
          quantity: qty,
          lifecycleStage: inferLifecycleStage({ ...item, quantity: qty }),
        })
        await recordInventoryEvent({
          itemId: id,
          itemName: item.name,
          type: qty > item.quantity ? 'restocked' : 'used',
          quantity: Math.abs(qty - item.quantity),
        })
        break
      }
    }
  }
  hie.refreshDebounced({ trigger: 'kitchen-batch', module: 'kitchen' })
  const trigger = action === 'mark-used' ? 'item-used'
    : action === 'freeze' ? 'frozen'
    : action === 'discard' ? 'expired'
    : action === 'update-qty' ? 'quantity-change'
    : 'inventory-batch'
  mealEngine.refreshDebounced({ trigger })
}

export function calculateExpirationFromPurchase(
  name: string,
  purchaseDate: string,
  location: PantryLocation,
  categories: string[] = [],
): { expirationDate: string; shelfLifeDays: number; confidence: PantryItem['expirationConfidence']; hint: string } {
  return estimateShelfLifeFromPurchase(name, purchaseDate, categories, location)
}

export async function syncLifecycleStages(): Promise<void> {
  const items = await db.pantryItems.toArray()
  const now = new Date()
  for (const item of items) {
    if (!item.id) continue
    const stage = inferLifecycleStage(item, now)
    if (stage !== item.lifecycleStage) {
      await db.pantryItems.update(item.id, { lifecycleStage: stage })
    }
  }
}

/**
 * Soft kitchen update after cooking — Haven estimates what was used.
 * Never invents certainty: only touches matched items, decrements gently.
 */
export async function consumeIngredientsForMeal(opts: {
  recipeName: string
  ingredients: string[]
  spices?: string[]
}): Promise<{ adjusted: number; names: string[] }> {
  const pantry = await db.pantryItems.filter(i => i.quantity > 0).toArray()
  const snapshot = buildInventorySnapshot(pantry)
  const matches = matchRecipeIngredients(
    opts.ingredients,
    opts.spices ?? [],
    snapshot,
  )
  const names: string[] = []
  let adjusted = 0
  const seen = new Set<number>()

  for (const m of matches) {
    if (m.matchType === 'missing' || !m.matchedItem) continue
    const item = m.matchedItem
    const itemId = item.id
    if (itemId == null) continue
    if (seen.has(itemId)) continue
    seen.add(itemId)
    const qty = typeof item.quantity === 'number' ? item.quantity : 1
    if (qty <= 0) continue

    // Soft estimate: use one unit, or mark used if only a little left
    const nextQty = qty <= 1 ? 0 : Math.max(0, qty - 1)
    await db.pantryItems.update(itemId, {
      quantity: nextQty,
      lifecycleStage: nextQty <= 0 ? 'used' : inferLifecycleStage({ ...item, quantity: nextQty }),
    })
    await recordInventoryEvent({
      itemId,
      itemName: item.name,
      type: 'used',
      quantity: qty - nextQty,
      note: `Used for ${opts.recipeName}`,
    })
    await recordUsageEvent(item.name, 'used')
    names.push(item.name)
    adjusted += 1
  }

  if (adjusted > 0) {
    hie.refreshDebounced({ trigger: 'meal-cooked', module: 'kitchen' })
    mealEngine.refreshDebounced({ trigger: 'item-used' })
  }
  return { adjusted, names }
}
