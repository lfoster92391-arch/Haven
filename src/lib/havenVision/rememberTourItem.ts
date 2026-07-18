import { format } from 'date-fns'
import type { PantryLocation } from '../../db/database'
import { addPantryItem } from '../inventoryService'
import { estimateShelfLifeFromPurchase } from '../shelfLifeEstimates'
import type { ProductScanIntelligence } from './types'

export async function rememberTourItem(opts: {
  intel: ProductScanIntelligence
  location: PantryLocation
}): Promise<{ name: string; alreadyHad: boolean }> {
  const name = opts.intel.productName.trim() || 'Grocery item'
  const date = format(new Date(), 'yyyy-MM-dd')
  const shelf = estimateShelfLifeFromPurchase(name, date, [], opts.location)

  const result = await addPantryItem({
    name,
    location: opts.location,
    category: opts.location === 'spice' ? 'Spices' : 'General',
    quantity: 1,
    unit: 'item',
    barcode: opts.intel.barcode,
    brand: opts.intel.brand,
    purchaseDate: date,
    expirationDate: shelf.expirationDate,
    expirationConfidence: shelf.confidence,
    shelfLifeDays: shelf.shelfLifeDays,
    lifecycleStage: 'stored',
  })

  return { name: result.name, alreadyHad: result.merged }
}
