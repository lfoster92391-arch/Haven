import { format } from 'date-fns'
import { db } from '../../db/database'
import {
  addFoodExclusion,
  appendAlwaysRemember,
  setBrandPreference,
} from './personalizationMemory'

export interface ChatActionResult {
  ok: boolean
  message: string
  route?: string
  needsConfirm?: boolean
}

export async function logSavingsHabit(amount: number, habit?: string): Promise<ChatActionResult> {
  const now = new Date().toISOString()
  await db.savingsRecords.add({
    type: 'store-optimization',
    amount,
    description: habit
      ? `Saved $${amount.toFixed(2)} — ${habit}`
      : `Saved $${amount.toFixed(2)} (logged via Ask Haven)`,
    createdAt: now,
  })
  if (habit) {
    await appendAlwaysRemember(`Savings habit: ${habit}`)
  }
  return {
    ok: true,
    message: habit
      ? `Logged $${amount.toFixed(2)} saved. I'll remember that ${habit} helped.`
      : `Logged $${amount.toFixed(2)} in savings.`,
    route: '/savings',
  }
}

export async function logGrocerySpend(
  amount: number,
  store?: string,
): Promise<ChatActionResult> {
  const today = format(new Date(), 'yyyy-MM-dd')
  const now = new Date().toISOString()
  await db.transactions.add({
    date: today,
    amount,
    category: 'Groceries',
    description: store ? `Groceries at ${store}` : 'Groceries',
    store,
    isImpulse: false,
    source: 'manual',
  })
  await db.ledgerEntries.add({
    date: today,
    amount,
    type: 'expense',
    category: 'Groceries',
    account: 'checking',
    description: store ? `Groceries at ${store}` : 'Groceries (Ask Haven)',
    source: 'manual',
    status: 'posted',
    createdAt: now,
    updatedAt: now,
  })
  return {
    ok: true,
    message: `Logged $${amount.toFixed(2)} grocery spend${store ? ` at ${store}` : ''}. Want to scan the receipt to update pantry?`,
    route: '/scan?mode=receipt',
    needsConfirm: true,
  }
}

export async function saveBrandPreference(item: string, brand: string): Promise<ChatActionResult> {
  await setBrandPreference(item, brand)
  return {
    ok: true,
    message: `Got it — I'll remember you prefer ${brand} for ${item}.`,
  }
}

export async function saveFoodExclusion(food: string): Promise<ChatActionResult> {
  await addFoodExclusion(food)
  return {
    ok: true,
    message: `Noted — I won't suggest meals with ${food}.`,
    route: '/kitchen',
  }
}

export function offerReceiptScan(): ChatActionResult {
  return {
    ok: true,
    message:
      'Open the scanner for your receipt — flat pages and good light work best. Haven will ask before writing pantry items.',
    route: '/scan?mode=receipt',
  }
}

export function offerRoomTour(room?: 'fridge' | 'freezer' | 'pantry' | 'spice'): ChatActionResult {
  const route = room ? `/scan?mode=tour&room=${room}` : '/scan?mode=tour'
  if (room === 'fridge') {
    return {
      ok: true,
      message: 'Want to show me your fridge? A few barcodes are enough — I’ll remember what you keep cold.',
      route,
    }
  }
  if (room === 'freezer') {
    return {
      ok: true,
      message: 'Shall we peek at the freezer together? No need to do everything tonight.',
      route,
    }
  }
  if (room === 'spice') {
    return {
      ok: true,
      message: 'I’d love to learn your spice rack. Even two or three jars help.',
      route,
    }
  }
  if (room === 'pantry') {
    return {
      ok: true,
      message: 'Want to help me learn your pantry? Show me what’s on the shelves you use most.',
      route,
    }
  }
  return {
    ok: true,
    message:
      'I’d love to learn your kitchen. Pick a shelf — fridge, freezer, pantry, or spices — and show me a few things when you’re ready.',
    route,
  }
}
