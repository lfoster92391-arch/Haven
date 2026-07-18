export * from './types'
export { routeScan, normalizeVisionBarcode, isDuplicateScan } from './visionRouter'
export { buildProductScanIntelligence } from './productScanIntelligence'
export {
  TOUR_ROOMS,
  getTourRoom,
  parseTourRoomParam,
  tourRoute,
  tourReliefMessage,
} from './roomTour'
export type { TourRoom, TourRoomId } from './roomTour'
export { rememberTourItem } from './rememberTourItem'
export {
  startScanSession,
  endScanSession,
  getActiveSessionId,
  addScanToSession,
  getSessionItems,
  getSessionSummary,
  getRecentSessions,
  resumeOrCreateSession,
} from './scanSession'
export {
  runSmartCheckout,
  defaultCheckoutOptions,
  checkoutOptionLabels,
} from './smartCheckout'
export {
  getSessionHistory,
  countUniqueScans,
  formatDuplicateMessage,
} from './scanHistory'
