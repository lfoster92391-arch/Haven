import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { HavenVisionCamera, type VisionScanMode } from '../components/havenVision/HavenVisionCamera'
import { RoomTourView } from '../components/havenVision/RoomTourView'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/Button'
import { integrateCouponAfterSave } from '../lib/couponIntegrations'
import { parseCouponIntelligence, couponLegacyFromStructured } from '../lib/couponParser'
import { db } from '../db/database'
import { getTourRoom, parseTourRoomParam } from '../lib/havenVision/roomTour'
import styles from './ModulePage.module.css'

function parseVisionMode(raw: string | null): VisionScanMode {
  if (raw === 'receipt' || raw === 'coupon' || raw === 'product' || raw === 'tour') return raw
  // Legacy / removed: pantry shelf AI — treat as product barcode scan
  if (raw === 'pantry') return 'product'
  return 'product'
}

export function Scan() {
  const [active, setActive] = useState(true)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const mode = parseVisionMode(searchParams.get('mode'))
  const tourRoom = mode === 'tour' ? getTourRoom(parseTourRoomParam(searchParams.get('room'))) : null

  function closeScan() {
    setActive(false)
    navigate(-1)
  }

  if (!active) {
    return (
      <div className={styles.page}>
        <PageHeader
          icon="📷"
          title="Haven’s eyes"
          subtitle="Show me a shelf when you’re ready — clear grocery barcodes work best"
        />
        <Button onClick={() => setActive(true)}>Open Camera</Button>
      </div>
    )
  }

  if (mode === 'tour' && !tourRoom) {
    return <RoomTourView onClose={closeScan} />
  }

  return (
    <HavenVisionCamera
      mode={mode}
      tourRoom={tourRoom}
      onClose={closeScan}
      onCouponResult={async raw => {
        const result = parseCouponIntelligence(raw, 'qr')
        const legacy = couponLegacyFromStructured(result.structured)
        await integrateCouponAfterSave(result.structured, legacy)
      }}
      onReceiptResult={async (parsed, imageData) => {
        await db.receipts.add({
          store: parsed.store ?? 'Unknown',
          amount: parsed.amount ?? 0,
          date: parsed.date ?? new Date().toISOString().split('T')[0],
          category: parsed.category ?? 'Groceries',
          lineItems: parsed.lineItems ?? [],
          imageData,
          rawText: parsed.rawText,
          createdAt: new Date().toISOString(),
        })
      }}
    />
  )
}
