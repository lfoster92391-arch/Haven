import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isBetaFeatureOpen } from '../lib/betaFeatures'
import { openAskHaven } from '../lib/havenChat'
import styles from './ScanFab.module.css'

type ScanAction =
  | { kind: 'nav'; emoji: string; label: string; path: string }
  | { kind: 'ask'; emoji: string; label: string }

const SCAN_ACTIONS: ScanAction[] = [
  { kind: 'nav', emoji: '🏠', label: 'Show Haven', path: '/scan?mode=tour' },
  { kind: 'nav', emoji: '📦', label: 'Product UPC', path: '/scan?mode=product' },
  { kind: 'nav', emoji: '🧾', label: 'Receipt', path: '/scan?mode=receipt' },
  { kind: 'nav', emoji: '🏷', label: 'Coupon', path: '/scan?mode=coupon' },
  { kind: 'ask', emoji: '🎤', label: 'Ask Haven' },
]

const LONG_PRESS_MS = 450

export function ScanFab() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const timerRef = useRef<number | null>(null)
  const longPressRef = useRef(false)
  const fabRef = useRef<HTMLButtonElement>(null)
  const actions = useMemo(
    () =>
      SCAN_ACTIONS.filter(a =>
        a.kind === 'ask' ? true : isBetaFeatureOpen(a.path.split('?')[0] ?? a.path),
      ),
    [],
  )

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const handlePointerDown = useCallback(() => {
    longPressRef.current = false
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      longPressRef.current = true
      setMenuOpen(true)
    }, LONG_PRESS_MS)
  }, [clearTimer])

  const handlePointerUp = useCallback(() => {
    clearTimer()
    if (!longPressRef.current) {
      navigate('/scan?mode=product')
    }
  }, [clearTimer, navigate])

  const handlePointerLeave = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  useEffect(() => {
    if (!menuOpen) return
    function onDocClick(e: MouseEvent) {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) {
        const menu = document.getElementById('scan-fab-menu')
        if (menu && !menu.contains(e.target as Node)) {
          setMenuOpen(false)
        }
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  return (
    <>
      {menuOpen && (
        <div id="scan-fab-menu" className={styles.menu} role="menu" aria-label="Scan quick actions">
          {actions.map(action => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => {
                setMenuOpen(false)
                if (action.kind === 'ask') {
                  openAskHaven({
                    hint: 'Ask about dinner, bills, or where you can save this week.',
                  })
                  return
                }
                navigate(action.path)
              }}
            >
              <span className={styles.menuEmoji}>{action.emoji}</span>
              {action.label}
            </button>
          ))}
        </div>
      )}
      <button
        ref={fabRef}
        type="button"
        className={styles.fab}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        onContextMenu={e => e.preventDefault()}
        aria-label="Open Haven Vision to scan groceries. Hold for quick actions."
        title="Tap to scan · Hold for more"
      >
        📷
      </button>
    </>
  )
}
