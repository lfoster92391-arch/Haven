import { useNavigate } from 'react-router-dom'
import { TOUR_ROOMS, type TourRoomId, tourRoute } from '../../lib/havenVision/roomTour'
import styles from './RoomTourView.module.css'

export interface RoomTourViewProps {
  onClose: () => void
  /** When set, picking a room calls this instead of navigating (optional). */
  onPickRoom?: (room: TourRoomId) => void
}

export function RoomTourView({ onClose, onPickRoom }: RoomTourViewProps) {
  const navigate = useNavigate()

  function pick(room: TourRoomId) {
    if (onPickRoom) {
      onPickRoom(room)
      return
    }
    navigate(tourRoute(room), { replace: true })
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          ←
        </button>
        <p className={styles.eyebrow}>Haven’s eyes</p>
      </header>

      <div className={styles.body}>
        <h1 className={styles.title}>Show me your kitchen</h1>
        <p className={styles.lead}>
          Pick a shelf when you’re ready. A few barcodes are enough — I’ll remember what you already
          have so you don’t have to.
        </p>

        <ul className={styles.rooms}>
          {TOUR_ROOMS.map(room => (
            <li key={room.id}>
              <button type="button" className={styles.roomBtn} onClick={() => pick(room.id)}>
                <span className={styles.roomIcon} aria-hidden>
                  {room.icon}
                </span>
                <span className={styles.roomText}>
                  <span className={styles.roomLabel}>{room.label}</span>
                  <span className={styles.roomQuestion}>{room.question}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <p className={styles.footerNote}>
          No rush. We’re introducing Haven to your home — not filling a spreadsheet.
        </p>
      </div>
    </div>
  )
}
