export {
  getBetaAdminEmail,
  getBetaAdminKey,
  unlockAdminSession,
  lockAdminSession,
  evaluateAdminAccess,
  isAdminEmail,
} from './adminGate'
export { maybeSendHeartbeat, recordSyncTelemetry, upsertBetaTelemetry } from './telemetry'
export { fetchBetaTesters, classifyStatus } from './betaTesters'
export type { BetaTesterRow, BetaSummary, BetaTestersResult, BetaStatus } from './betaTesters'
export {
  recordAppSession,
  shouldShowFeedbackPrompt,
  submitBetaFeedback,
  dismissFeedbackPrompt,
  fetchCloudFeedback,
  BUILD_NEXT_CHIPS,
} from './feedback'
export type { FeedbackSubmitInput, CloudFeedbackRow } from './feedback'
export {
  summarizeHelpHavenLearn,
  buildHelpHavenInsightReport,
  buildMemberHelpHavenInsight,
  enhanceInsightNarrative,
} from './helpHavenLearnInsights'
export type {
  HelpHavenInsightReport,
  InsightTheme,
  InsightPriority,
  InsightAudience,
} from './helpHavenLearnInsights'
export { openHelpHavenLearn, HELP_HAVEN_LEARN_OPEN_EVENT } from './helpHavenLearnEvents'
export { markFoundersWelcomeSeen, shouldShowFoundersWelcome } from './foundersWelcome'
export {
  getFoundingMemberImpact,
  getPendingFoundersThanks,
  markFoundersThanksSeen,
  SHIPPED_FOUNDERS_FEATURES,
} from './foundingMemberImpact'
export type { FoundingMemberImpact, FoundersRememberedThanks } from './foundingMemberImpact'
