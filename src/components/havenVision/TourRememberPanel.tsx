import { useState } from 'react'
import type { ProductScanIntelligence } from '../../lib/havenVision'
import { rememberTourItem } from '../../lib/havenVision/rememberTourItem'
import type { TourRoom } from '../../lib/havenVision/roomTour'
import { Button } from '../Button'
import styles from './havenVision.module.css'

export interface TourRememberPanelProps {
  intel: ProductScanIntelligence
  room: TourRoom
  onRemembered: (name: string) => void
  onDismiss: () => void
}

export function TourRememberPanel({ intel, room, onRemembered, onDismiss }: TourRememberPanelProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await rememberTourItem({ intel, location: room.location })
      onRemembered(result.name)
    } catch {
      setError('Something didn’t go quite as planned. Let’s try again.')
      setBusy(false)
    }
  }

  return (
    <div className={styles.panel}>
      {intel.imageUrl && (
        <img
          src={intel.imageUrl}
          alt=""
          style={{ width: 64, height: 64, objectFit: 'contain', float: 'right' }}
        />
      )}
      <h3 className={styles.productName}>{intel.productName}</h3>
      {intel.brand && <p className={styles.productMeta}>{intel.brand}</p>}
      {intel.ownedCount !== undefined && intel.ownedCount > 0 && (
        <p className={styles.productMeta}>Looks like you already keep this nearby.</p>
      )}
      <p className={styles.productMeta}>{room.rememberLine}</p>
      {error && <p className={styles.productMeta}>{error}</p>}
      <div className={styles.actions}>
        <Button onClick={() => void confirm()} disabled={busy}>
          {busy ? 'Remembering…' : 'Yes — remember this'}
        </Button>
        <Button variant="ghost" onClick={onDismiss} disabled={busy}>
          Not this one
        </Button>
      </div>
    </div>
  )
}
