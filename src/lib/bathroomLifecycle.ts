import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { db, type BathroomReplaceable, type BathroomReplaceableKind } from '../db/database'

export interface BathroomCatalogItem {
  kind: BathroomReplaceableKind
  label: string
  intervalDays: number
  /** Why Haven notices — calm, never alarming */
  why: string
}

/** Common bathroom replaceables — household assistant, not grocery inventory. */
export const BATHROOM_CATALOG: BathroomCatalogItem[] = [
  {
    kind: 'toothbrush',
    label: 'Toothbrush',
    intervalDays: 90,
    why: 'Bristles soften long before most people notice.',
  },
  {
    kind: 'brush-head',
    label: 'Electric brush head',
    intervalDays: 90,
    why: 'A fresh head keeps the quiet morning routine feeling good.',
  },
  {
    kind: 'loofah',
    label: 'Loofah',
    intervalDays: 30,
    why: 'Loofahs hold onto more than they should after a few weeks.',
  },
  {
    kind: 'shower-pouf',
    label: 'Shower pouf',
    intervalDays: 30,
    why: 'A soft swap keeps the shower feeling clean again.',
  },
  {
    kind: 'washcloth',
    label: 'Washcloths',
    intervalDays: 90,
    why: 'Cloths wear thin — a fresh set is a small kindness.',
  },
  {
    kind: 'razor',
    label: 'Razor / blades',
    intervalDays: 30,
    why: 'Dull blades nibble more than they shave.',
  },
  {
    kind: 'floss',
    label: 'Floss / picks',
    intervalDays: 60,
    why: 'Easy to forget until the little jar is empty.',
  },
]

export type BathroomCareTone = 'ok' | 'soon' | 'ready'

export interface BathroomCareStatus {
  item: BathroomReplaceable
  catalog: BathroomCatalogItem
  daysLeft: number
  dueDate: string
  tone: BathroomCareTone
  /** Reassurance-first line for Home / whispers */
  line: string
  whisper?: string
}

function catalogFor(kind: BathroomReplaceableKind): BathroomCatalogItem {
  return BATHROOM_CATALOG.find(c => c.kind === kind) ?? {
    kind,
    label: kind,
    intervalDays: 60,
    why: 'I’ll keep an eye on this with you.',
  }
}

export function statusForReplaceable(
  item: BathroomReplaceable,
  reference = new Date(),
): BathroomCareStatus {
  const catalog = catalogFor(item.kind)
  const started = parseISO(item.startedAt)
  const due = addDays(started, item.intervalDays || catalog.intervalDays)
  const daysLeft = differenceInCalendarDays(due, reference)
  const dueDate = format(due, 'yyyy-MM-dd')

  let tone: BathroomCareTone = 'ok'
  if (daysLeft <= 0) tone = 'ready'
  else if (daysLeft <= 7) tone = 'soon'

  const label = item.label || catalog.label
  let line: string
  let whisper: string | undefined

  if (tone === 'ready') {
    line = `Your ${label.toLowerCase()} is ready for a fresh start when you are.`
    whisper = 'No rush — I’ll keep it in mind until you swap it.'
  } else if (tone === 'soon') {
    line =
      daysLeft === 1
        ? `Your ${label.toLowerCase()} may want a refresh tomorrow.`
        : `Your ${label.toLowerCase()} may want a refresh in about ${daysLeft} days.`
    whisper = catalog.why
  } else {
    const weeks = Math.max(1, Math.round(daysLeft / 7))
    line =
      daysLeft > 21
        ? `Your ${label.toLowerCase()} still has a few weeks left — I’ve got it.`
        : `Your ${label.toLowerCase()} looks fine for now.`
    whisper = weeks >= 2 ? `I’ll check in closer to the refresh.` : catalog.why
  }

  return { item, catalog, daysLeft, dueDate, tone, line, whisper }
}

export async function listBathroomReplaceables(): Promise<BathroomReplaceable[]> {
  return db.bathroomReplaceables.orderBy('updatedAt').reverse().toArray()
}

export async function getBathroomCareStatuses(
  reference = new Date(),
): Promise<BathroomCareStatus[]> {
  const items = await listBathroomReplaceables()
  return items
    .map(item => statusForReplaceable(item, reference))
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

/** Soft Home whisper — one thing at most, reassurance first. */
export async function getBathroomCareWhisper(
  reference = new Date(),
): Promise<BathroomCareStatus | null> {
  const statuses = await getBathroomCareStatuses(reference)
  return statuses.find(s => s.tone === 'ready' || s.tone === 'soon') ?? null
}

export async function learnBathroomItems(
  kinds: BathroomReplaceableKind[],
  startedAt = format(new Date(), 'yyyy-MM-dd'),
): Promise<number> {
  const now = new Date().toISOString()
  const keep = new Set(kinds)
  const existing = await db.bathroomReplaceables.toArray()

  for (const row of existing) {
    if (row.id != null && !keep.has(row.kind)) {
      await db.bathroomReplaceables.delete(row.id)
    }
  }

  let touched = 0
  for (const kind of kinds) {
    const catalog = catalogFor(kind)
    const row = existing.find(e => e.kind === kind)
    if (row?.id != null) {
      await db.bathroomReplaceables.update(row.id, {
        intervalDays: catalog.intervalDays,
        label: catalog.label,
        updatedAt: now,
      })
      touched += 1
    } else {
      await db.bathroomReplaceables.add({
        kind,
        label: catalog.label,
        startedAt,
        intervalDays: catalog.intervalDays,
        createdAt: now,
        updatedAt: now,
      })
      touched += 1
    }
  }
  window.dispatchEvent(new CustomEvent('haven:bathroom-learned'))
  return touched
}

export async function markBathroomReplaced(id: number): Promise<void> {
  const now = new Date().toISOString()
  const today = format(new Date(), 'yyyy-MM-dd')
  await db.bathroomReplaceables.update(id, {
    startedAt: today,
    updatedAt: now,
  })
  window.dispatchEvent(new CustomEvent('haven:bathroom-learned'))
}

export async function bathroomAreaDetail(
  reference = new Date(),
): Promise<{ tone: 'ok' | 'attention' | 'unknown'; detail: string } | null> {
  const statuses = await getBathroomCareStatuses(reference)
  if (statuses.length === 0) return null
  const ready = statuses.filter(s => s.tone === 'ready')
  const soon = statuses.filter(s => s.tone === 'soon')
  if (ready.length > 0) {
    return {
      tone: 'attention',
      detail:
        ready.length === 1
          ? `${ready[0].item.label} ready for a refresh`
          : `${ready.length} gentle refreshes waiting`,
    }
  }
  if (soon.length > 0) {
    return { tone: 'attention', detail: 'A soft refresh coming soon' }
  }
  return { tone: 'ok', detail: 'Bathroomables look settled' }
}
