import { useEffect, useState } from 'react'
import { useReadOnlyLiveQuery } from '../lib/db/safeLiveQuery'
import { db, type DealAlert, type PriceHistory, type SavingsRecord, type ShoppingTrip } from '../db/database'
import hbi from '../lib/buyingIntelligence/hbi'
import { deferNonCritical } from '../lib/deferWork'
import type { HBISnapshot } from '../lib/buyingIntelligence/types'

export function useHBISnapshot(): HBISnapshot | null {
  const [snapshot, setSnapshot] = useState<HBISnapshot | null>(hbi.getCachedHBISnapshot())

  useEffect(() => {
    const unsub = hbi.subscribeHBI(setSnapshot)
    // Skip mount refresh when HIE/scheduler already warmed the cache.
    if (!hbi.getCachedHBISnapshot()) {
      deferNonCritical(() => {
        hbi.refresh({ trigger: 'hook-mount' }).catch(console.warn)
      }, 800)
    }
    return unsub
  }, [])

  return snapshot
}

export function useDealAlerts() {
  return useReadOnlyLiveQuery(async () => {
    const items = await db.dealAlerts.filter(a => !a.dismissed).toArray()
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  })
}

export function usePriceHistory(limit = 100) {
  return useReadOnlyLiveQuery(async () => {
    const items = await db.priceHistory.orderBy('recordedAt').reverse().limit(limit).toArray()
    return items
  }, [limit])
}

export function useSavingsRecords(limit = 50) {
  return useReadOnlyLiveQuery(async () => {
    const items = await db.savingsRecords.orderBy('createdAt').reverse().limit(limit).toArray()
    return items
  }, [limit])
}

export function useShoppingTrips() {
  return useReadOnlyLiveQuery(async () => {
    const items = await db.shoppingTrips.toArray()
    return items.sort((a, b) => (b.plannedDate ?? '').localeCompare(a.plannedDate ?? ''))
  })
}

export type { HBISnapshot, DealAlert, PriceHistory, SavingsRecord, ShoppingTrip }
