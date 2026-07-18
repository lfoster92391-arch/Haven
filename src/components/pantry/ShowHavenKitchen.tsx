import { useNavigate } from 'react-router-dom'
import { tourRoute } from '../../lib/havenVision/roomTour'
import styles from './ShowHavenKitchen.module.css'

/** Calm Kitchen CTA — camera as Haven’s eyes, not an inventory scanner. */
export function ShowHavenKitchen() {
  const navigate = useNavigate()

  return (
    <section className={styles.section} aria-label="Help Haven learn your kitchen">
      <p className={styles.eyebrow}>Haven’s eyes</p>
      <h3 className={styles.title}>Help Haven learn this shelf</h3>
      <p className={styles.copy}>
        Show me your fridge, freezer, pantry, or spices. A few barcodes are enough — I’ll remember
        what’s already home.
      </p>
      <button type="button" className={styles.btn} onClick={() => navigate(tourRoute())}>
        Show Haven my kitchen
      </button>
    </section>
  )
}
