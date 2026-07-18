import type { PantryLocation } from '../../db/database'

export type TourRoomId = 'fridge' | 'freezer' | 'pantry' | 'spice'

export interface TourRoom {
  id: TourRoomId
  location: PantryLocation
  label: string
  icon: string
  question: string
  invite: string
  scanHint: string
  rememberLine: string
}

export const TOUR_ROOMS: TourRoom[] = [
  {
    id: 'fridge',
    location: 'fridge',
    label: 'Fridge',
    icon: '🧊',
    question: 'Want to show me your fridge?',
    invite: 'Scan a few barcodes when you’re ready. I’ll remember what you keep cold.',
    scanHint: 'Hold a clear barcode toward me — one item at a time is perfect.',
    rememberLine: 'I’ll remember this for your fridge.',
  },
  {
    id: 'freezer',
    location: 'freezer',
    label: 'Freezer',
    icon: '❄️',
    question: 'Shall we peek at the freezer together?',
    invite: 'A few scans go a long way. No need to do everything tonight.',
    scanHint: 'Frozen packages can be glossy — steady light helps me read them.',
    rememberLine: 'I’ll remember this for your freezer.',
  },
  {
    id: 'pantry',
    location: 'pantry',
    label: 'Pantry',
    icon: '🏠',
    question: 'Want to help me learn your pantry?',
    invite: 'Show me what’s on the shelves you use most. The rest can wait.',
    scanHint: 'Clear grocery UPCs work best — shelf tags are trickier.',
    rememberLine: 'I’ll remember this for your pantry.',
  },
  {
    id: 'spice',
    location: 'spice',
    label: 'Spices',
    icon: '🧂',
    question: 'Want to show me your spice rack?',
    invite: 'Even two or three jars help me cook with what you already have.',
    scanHint: 'Small bottles are fine — just keep the barcode in the frame.',
    rememberLine: 'I’ll remember this for your spices.',
  },
]

export function getTourRoom(id: string | null | undefined): TourRoom | null {
  if (!id) return null
  return TOUR_ROOMS.find(r => r.id === id) ?? null
}

export function parseTourRoomParam(raw: string | null): TourRoomId | null {
  if (raw === 'fridge' || raw === 'freezer' || raw === 'pantry' || raw === 'spice') return raw
  return null
}

export function tourRoute(room?: TourRoomId): string {
  return room ? `/scan?mode=tour&room=${room}` : '/scan?mode=tour'
}

export function tourReliefMessage(room: TourRoom, learnedCount: number): string {
  if (learnedCount <= 0) {
    return `No rush — when you’re ready, we can try the ${room.label.toLowerCase()} again. I’ll be here.`
  }
  if (learnedCount === 1) {
    return `I’ll remember that one for your ${room.label.toLowerCase()}. One less thing living only in your head.`
  }
  return `I’ll remember ${learnedCount} things from your ${room.label.toLowerCase()}. You’re teaching Haven your home — gently.`
}
