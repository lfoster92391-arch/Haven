/**
 * Bridge so the leaf affordance (and future entry points) can open Help Haven Learn.
 */
export const HELP_HAVEN_LEARN_OPEN_EVENT = 'haven:help-learn-open'

export function openHelpHavenLearn(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(HELP_HAVEN_LEARN_OPEN_EVENT))
}
