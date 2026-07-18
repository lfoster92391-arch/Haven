export type TodayModule =
  | 'shopping'
  | 'pantry'
  | 'household'
  | 'wellness'
  | 'budget'
  | 'meals'
  | 'finance'

export type TodayPriority = 'do-today' | 'this-week' | 'consider-later' | 'completed'

export interface TodayDecision {
  id: string
  module: TodayModule
  priority: TodayPriority
  title: string
  subtitle?: string
  confidence?: number
  reasons: string[]
  metric?: { label: string; value: string }
  actionLabel: string
  actionType: 'one-tap' | 'navigate'
  actionPayload?: Record<string, unknown>
  actionRoute?: string
  quickWin?: boolean
  savingsAmount?: number
  timeMinutes?: number
  observationId?: number
  sourceKey?: string
  evidenceSources?: import('../intelligence/credibilityTypes').EvidenceSource[]
  whyExplanation?: string[]
  isDemo?: boolean
}

export interface TodayStats {
  totalDecisions: number
  highPriority: number
  quickWins: number
  potentialSavings: number
  timeMinutes: number
  dayWeight: 'light' | 'moderate' | 'heavy'
}

export interface TodaySnapshot {
  decisions: TodayDecision[]
  stats: TodayStats
}

export const TODAY_MODULE_LABELS: Record<TodayModule, string> = {
  shopping: 'Shopping',
  pantry: 'Pantry',
  household: 'Household',
  wellness: 'Wellness',
  budget: 'Budget',
  meals: 'Meals',
  finance: 'Finance',
}

export const TODAY_MODULE_ICONS: Record<TodayModule, string> = {
  shopping: '🛒',
  pantry: '🥛',
  household: '🧹',
  wellness: '💧',
  budget: '💰',
  meals: '🍽️',
  finance: '💰',
}

export const TODAY_PRIORITY_EMOJI: Record<TodayPriority, string> = {
  'do-today': '🔥',
  'this-week': '⚠️',
  'consider-later': '💡',
  completed: '✔',
}

export const TODAY_SECTIONS: { key: TodayPriority; title: string }[] = [
  { key: 'do-today', title: 'Also helpful today' },
  { key: 'this-week', title: 'This week, gently' },
  { key: 'consider-later', title: 'Can wait' },
  { key: 'completed', title: 'Already handled' },
]
