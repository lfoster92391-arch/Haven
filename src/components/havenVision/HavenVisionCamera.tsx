import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { createWorker } from 'tesseract.js'
import { parseReceiptText } from '../../lib/receiptParser'
import { parseCouponIntelligence } from '../../lib/couponIntelligenceParser'
import {
  routeScan,
  normalizeVisionBarcode,
  buildProductScanIntelligence,
  resumeOrCreateSession,
  addScanToSession,
  getSessionSummary,
  getSessionHistory,
  formatDuplicateMessage,
  type ProductScanIntelligence,
  type ScanSessionSummary,
} from '../../lib/havenVision'
import type { ScanHistoryEntry } from '../../lib/havenVision/scanHistory'
import { ProductScanPanel } from './ProductScanPanel'
import { TourRememberPanel } from './TourRememberPanel'
import { VisionScanHistory } from './VisionScanHistory'
import { ScanCartSummary } from './ScanCartSummary'
import { SmartCheckoutModal } from './SmartCheckoutModal'
import { runSmartCheckout } from '../../lib/havenVision/smartCheckout'
import type { TourRoom } from '../../lib/havenVision/roomTour'
import { tourReliefMessage } from '../../lib/havenVision/roomTour'
import styles from './havenVision.module.css'

export type VisionScanMode = 'product' | 'receipt' | 'coupon' | 'tour'

const ALL_FORMATS = [
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.QR_CODE,
]

const STATUS_BY_MODE: Record<Exclude<VisionScanMode, 'tour'>, string> = {
  product: 'Hold a clear grocery UPC in the frame',
  receipt: 'Fill the frame with the receipt, then tap Receipt',
  coupon: 'Hold a coupon barcode or QR in the frame',
}

const EXPECTATION_HINT =
  'I do best with clear grocery barcodes — shelf tags and wrinkled packs are trickier.'

function statusForMode(mode: VisionScanMode, tourRoom?: TourRoom | null): string {
  if (mode === 'tour' && tourRoom) return tourRoom.scanHint
  if (mode === 'tour') return 'Hold a clear grocery UPC in the frame'
  return STATUS_BY_MODE[mode]
}
function createReader(): BrowserMultiFormatReader {
  const hints = new Map<DecodeHintType, unknown>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, ALL_FORMATS)
  hints.set(DecodeHintType.TRY_HARDER, true)
  return new BrowserMultiFormatReader(hints)
}

export interface HavenVisionCameraProps {
  shoppingMode?: boolean
  /** Deep-link from Scan FAB / Ask Haven */
  mode?: VisionScanMode
  /** Kitchen zone tour — Haven’s eyes learning a shelf */
  tourRoom?: TourRoom | null
  onClose: () => void
  onCouponResult?: (raw: string) => void | Promise<void>
  onReceiptResult?: (parsed: ReturnType<typeof parseReceiptText>, imageData: string) => void
}

export function HavenVisionCamera({
  shoppingMode = false,
  mode = 'product',
  tourRoom = null,
  onClose,
  onCouponResult,
  onReceiptResult,
}: HavenVisionCameraProps) {
  const isTour = mode === 'tour' && Boolean(tourRoom)
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const handlingRef = useRef(false)
  const lastScanRef = useRef(0)

  const [status, setStatus] = useState(() =>
    shoppingMode
      ? 'Shopping Mode — continuous scan'
      : statusForMode(mode, tourRoom),
  )
  const [torchOn, setTorchOn] = useState(false)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [lowLight] = useState(false)
  const [showFallback, setShowFallback] = useState(mode === 'receipt')
  const [continuous, setContinuous] = useState(shoppingMode || isTour)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [intel, setIntel] = useState<ProductScanIntelligence | null>(null)
  const [history, setHistory] = useState<ScanHistoryEntry[]>([])
  const [summary, setSummary] = useState<ScanSessionSummary | null>(null)
  const [showCheckout, setShowCheckout] = useState(false)
  const [processingReceipt, setProcessingReceipt] = useState(false)
  const [learnedCount, setLearnedCount] = useState(0)
  const [lastRemembered, setLastRemembered] = useState<string | null>(null)
  const tourPanelOpenRef = useRef(false)

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    const stream = videoRef.current?.srcObject as MediaStream | null
    stream?.getTracks().forEach(t => t.stop())
    if (videoRef.current) videoRef.current.srcObject = null
    setTorchOn(false)
  }, [])

  const refreshSession = useCallback(async (sid: number) => {
    const [sum, hist] = await Promise.all([
      getSessionSummary(sid),
      getSessionHistory(sid),
    ])
    setSummary(sum)
    setHistory(hist)
  }, [])

  const handleScan = useCallback(async (raw: string, format?: string) => {
    if (handlingRef.current) return
    if (mode === 'tour' && tourPanelOpenRef.current) return
    const now = Date.now()
    if (now - lastScanRef.current < 1500 && continuous) return
    lastScanRef.current = now

    handlingRef.current = true
    const routed = routeScan(raw, format)

    try {
      if ((routed.type === 'coupon' || mode === 'coupon') && mode !== 'tour') {
        setStatus('Coupon detected')
        if (onCouponResult) {
          await onCouponResult(raw)
        } else {
          parseCouponIntelligence(raw, 'qr')
        }
        if (!continuous) stopCamera()
        handlingRef.current = false
        return
      }

      if (mode === 'tour') {
        if (routed.type !== 'product') {
          setStatus('I need a clear grocery barcode for this shelf — try again when you’re ready.')
          handlingRef.current = false
          return
        }
        const barcode = normalizeVisionBarcode(routed.raw)
        setStatus('I see something — is this right?')
        const productIntel = await buildProductScanIntelligence(barcode)
        tourPanelOpenRef.current = true
        setIntel(productIntel)
        handlingRef.current = false
        return
      }

      if (routed.type === 'product') {
        const barcode = normalizeVisionBarcode(routed.raw)
        setStatus(`Scanned ${barcode}`)
        const sid = sessionId ?? await resumeOrCreateSession(shoppingMode)
        if (!sessionId) setSessionId(sid)

        const productIntel = await buildProductScanIntelligence(barcode)
        const { duplicate } = await addScanToSession(sid, {
          barcode,
          productName: productIntel.productName,
          recommendation: productIntel.recommendation,
          price: productIntel.currentPrice,
        })

        if (duplicate) {
          setStatus(formatDuplicateMessage(productIntel.productName))
        } else {
          setIntel(productIntel)
        }

        await refreshSession(sid)
        if (!continuous) stopCamera()
        handlingRef.current = false
        return
      }

      setShowFallback(true)
      setStatus('Could not auto-detect — choose type below')
    } catch {
      setStatus('Scan failed — try again')
    }
    handlingRef.current = false
  }, [continuous, mode, onCouponResult, refreshSession, sessionId, shoppingMode, stopCamera])

  const setTorch = useCallback(async (on: boolean) => {
    const stream = videoRef.current?.srcObject as MediaStream | null
    const track = stream?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      setTorchOn(on)
    } catch { /* torch not supported */ }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      const sid = await resumeOrCreateSession(shoppingMode)
      if (!cancelled) {
        setSessionId(sid)
        await refreshSession(sid)
      }

      if (!videoRef.current) return

      try {
        // Let ZXing own the stream (avoids double getUserMedia, which fails on some phones).
        const reader = createReader()
        readerRef.current = reader

        controlsRef.current = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result, _err, ctrl) => {
            if (!result || handlingRef.current) return
            const text = result.getText()
            const fmt = result.getBarcodeFormat()
            void handleScan(text, String(fmt))
            if (!continuous) ctrl.stop()
          },
        )

        if (cancelled) {
          stopCamera()
          return
        }

        const stream = videoRef.current.srcObject as MediaStream | null
        const track = stream?.getVideoTracks()[0]
        const caps = track?.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean }
        setTorchAvailable(Boolean(caps?.torch))

        setStatus(
          shoppingMode
            ? 'Shopping Mode — continuous scan'
            : statusForMode(mode, tourRoom),
        )
        if (mode === 'receipt') setShowFallback(true)
      } catch {
        setStatus('Camera not available — try photo upload from Savings or Finance')
        setShowFallback(true)
      }
    }

    init()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [continuous, handleScan, mode, refreshSession, shoppingMode, stopCamera, tourRoom])

  async function captureReceipt() {
    if (!videoRef.current) return
    setProcessingReceipt(true)
    setStatus('Reading receipt…')

    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    if (!canvas.width || !canvas.height) {
      setStatus('Camera not ready — wait a moment and try again')
      setProcessingReceipt(false)
      return
    }
    canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0)
    const imageData = canvas.toDataURL('image/jpeg', 0.7)

    try {
      const worker = await createWorker('eng')
      const { data: { text } } = await worker.recognize(canvas)
      await worker.terminate()
      const parsed = parseReceiptText(text)
      await onReceiptResult?.(parsed, imageData)
      stopCamera()
      setStatus('Receipt saved — review totals in Finance if needed')
      setShowFallback(true)
    } catch {
      setStatus('Could not read receipt — try brighter light and a flat page')
    }
    setProcessingReceipt(false)
  }

  async function handleCheckout(options: Parameters<typeof runSmartCheckout>[1]) {
    if (!sessionId) return
    await runSmartCheckout(sessionId, options)
    setShowCheckout(false)
    onClose()
  }

  function handleTourRemembered(name: string) {
    setLearnedCount(n => n + 1)
    setLastRemembered(name)
    tourPanelOpenRef.current = false
    setIntel(null)
    setStatus(tourRoom ? `${tourRoom.rememberLine.replace(/\.$/, '')} — ${name}.` : `I’ll remember ${name}.`)
  }

  function finishTour() {
    if (tourRoom && learnedCount > 0) {
      setStatus(tourReliefMessage(tourRoom, learnedCount))
    }
    onClose()
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <h2>
          {isTour && tourRoom
            ? `${tourRoom.icon} Learning your ${tourRoom.label.toLowerCase()}`
            : '📷 Haven Vision'}
        </h2>
        {!isTour && summary && summary.itemCount > 0 && (
          <span className={styles.cartBadge}>{summary.itemCount}</span>
        )}
        {isTour && learnedCount > 0 && (
          <span className={styles.cartBadge}>{learnedCount}</span>
        )}
        <button
          type="button"
          className={styles.closeBtn}
          onClick={isTour ? finishTour : onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {isTour && tourRoom && (
        <p className={styles.tourInvite}>{tourRoom.invite}</p>
      )}

      <div className={styles.viewfinder}>
        <video ref={videoRef} className={styles.video} playsInline muted />
        <div className={styles.scanLine} />
      </div>

      <p className={styles.status}>{status}</p>
      <p className={styles.hint}>
        {isTour && tourRoom ? tourRoom.scanHint : EXPECTATION_HINT}
      </p>
      {lastRemembered && isTour && (
        <p className={styles.hint}>Last remembered: {lastRemembered}</p>
      )}
      {lowLight && <p className={styles.hint}>Low light — try torch or move to brighter area</p>}

      <div className={styles.controls}>
        {torchAvailable && (
          <button
            type="button"
            className={`${styles.controlBtn} ${torchOn ? styles.controlBtnActive : ''}`}
            onClick={() => setTorch(!torchOn)}
          >
            {torchOn ? '🔦 Torch On' : '🔦 Torch'}
          </button>
        )}
        {!isTour && (
          <button
            type="button"
            className={`${styles.controlBtn} ${continuous ? styles.controlBtnActive : ''}`}
            onClick={() => setContinuous(c => !c)}
          >
            {continuous ? 'Continuous' : 'Single Scan'}
          </button>
        )}
        {!isTour && summary && summary.itemCount > 0 && (
          <button type="button" className={styles.controlBtn} onClick={() => setShowCheckout(true)}>
            Checkout
          </button>
        )}
        {isTour && (
          <button type="button" className={styles.controlBtn} onClick={finishTour}>
            {learnedCount > 0 ? 'That’s enough for now' : 'Maybe later'}
          </button>
        )}
      </div>

      {!isTour && <VisionScanHistory entries={history} />}

      {intel && isTour && tourRoom && (
        <TourRememberPanel
          intel={intel}
          room={tourRoom}
          onRemembered={handleTourRemembered}
          onDismiss={() => {
            tourPanelOpenRef.current = false
            setIntel(null)
            setStatus(tourRoom.scanHint)
          }}
        />
      )}

      {intel && !isTour && (
        <ProductScanPanel
          intel={intel}
          onDismiss={() => setIntel(null)}
        />
      )}

      {!isTour && summary && summary.itemCount > 0 && !intel && (
        <ScanCartSummary
          summary={summary}
          onCheckout={() => setShowCheckout(true)}
        />
      )}

      {showFallback && !isTour && (
        <div className={styles.fallback}>
          <p style={{ color: '#fff', fontSize: '0.85rem' }}>What are you scanning?</p>
          <button type="button" className={styles.fallbackBtn} onClick={captureReceipt} disabled={processingReceipt}>
            🧾 Receipt
          </button>
          <button type="button" className={styles.fallbackBtn} onClick={() => setShowFallback(false)}>
            🏷️ Product / Coupon (retry)
          </button>
        </div>
      )}

      <footer className={styles.footer}>
        <p className={styles.footerTitle}>
          {isTour ? 'Helping Haven learn your home' : 'Haven Vision'}
        </p>
        <p className={styles.hint} style={{ paddingBottom: 0 }}>
          {isTour
            ? 'Clear grocery barcodes work best. No need to finish every shelf tonight.'
            : 'Clear grocery barcodes and flat receipts work best right now. Shelf and AR views are still on the way.'}
        </p>
      </footer>

      {!isTour && showCheckout && summary && (
        <SmartCheckoutModal
          itemCount={summary.itemCount}
          onConfirm={handleCheckout}
          onClose={() => setShowCheckout(false)}
        />
      )}
    </div>
  )
}
