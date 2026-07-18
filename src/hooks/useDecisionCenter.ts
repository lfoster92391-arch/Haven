import { useMemo } from 'react'
import { useIntelligence } from './useIntelligence'
import type { DecisionItem } from '../lib/intelligence/types'

export function useDecisionCenter() {
  const { decisions, loading, refreshedAt, refresh, dismiss, snooze } = useIntelligence()

  const sorted = useMemo(() => decisions, [decisions])

  const actionable = useMemo(
    () => sorted.filter(d => d.actionType === 'one-tap' || d.actionType === 'navigate'),
    [sorted],
  )

  const oneTap = useMemo(
    () => sorted.filter(d => d.actionType === 'one-tap'),
    [sorted],
  )

  return {
    decisions: sorted as DecisionItem[],
    actionable,
    oneTap,
    loading,
    refreshedAt,
    refresh,
    dismiss,
    snooze,
  }
}
