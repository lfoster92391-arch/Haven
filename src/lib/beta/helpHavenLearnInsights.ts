import type { CloudFeedbackRow } from './feedback'

export type InsightThemeKind = 'love' | 'wish' | 'bug' | 'confused'

export interface InsightTheme {
  id: string
  label: string
  kind: InsightThemeKind
  count: number
  examples: string[]
}

export interface InsightPriority {
  rank: number
  title: string
  why: string
  signals: number
}

export interface HelpHavenInsightReport {
  generatedAt: string
  mode: 'local-intelligence' | 'llm-enhanced'
  headline: string
  responseCount: number
  sentiment: {
    label: 'warm' | 'mixed' | 'needs-care'
    averageRating: number | null
    recommendYesPct: number | null
    summary: string
  }
  themes: InsightTheme[]
  duplicates: { theme: string; count: number; note: string }[]
  priorities: InsightPriority[]
  bugs: { text: string; who: string; when: string }[]
  praise: { text: string; who: string }[]
  /** Calm briefing Lisa can skim in one breath */
  narrative: string
  llmNote?: string
}

const THEME_RULES: { id: string; label: string; kind: InsightThemeKind; match: RegExp }[] = [
  { id: 'meals', label: 'Meals & cooking', kind: 'wish', match: /\b(meal|cook|recipe|dinner|kitchen|tonight)\b/i },
  { id: 'money', label: 'Money & bills', kind: 'wish', match: /\b(money|bill|budget|finance|spend|due)\b/i },
  { id: 'savings', label: 'Savings & shopping', kind: 'wish', match: /\b(sav(e|ings)|shop|coupon|deal|grocery|list)\b/i },
  { id: 'pantry', label: 'Pantry & shelves', kind: 'wish', match: /\b(pantry|fridge|freezer|spice|shelf|inventory)\b/i },
  { id: 'eyes', label: 'Haven’s eyes / camera', kind: 'wish', match: /\b(scan|camera|barcode|receipt|vision)\b/i },
  { id: 'sync', label: 'Sync & sign-in', kind: 'wish', match: /\b(sync|sign[- ]?in|login|account|device)\b/i },
  { id: 'packages', label: 'Packages & home', kind: 'wish', match: /\b(package|deliver|mail|home care|laundry)\b/i },
  { id: 'calm', label: 'Calm / relief feeling', kind: 'love', match: /\b(calm|peace|relief|love|helpful|warm|easy|gentle)\b/i },
  { id: 'confused', label: 'Confusing moments', kind: 'confused', match: /\b(confus|unclear|lost|where|find|hard to)\b/i },
  { id: 'broken', label: 'Something felt off', kind: 'bug', match: /\b(broken|bug|crash|error|stuck|fail|doesn'?t work|not work)\b/i },
]

const BUILD_NEXT_LABELS: Record<string, string> = {
  shopping: 'Shopping',
  meals: 'Meals',
  money: 'Money',
  sync: 'Sync',
  packages: 'Packages',
  other: 'Something else',
}

function whoLabel(row: CloudFeedbackRow): string {
  if (row.is_guest || !row.email) return 'Founding Member (guest)'
  return row.email
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function collectTexts(row: CloudFeedbackRow): string[] {
  return [row.working_well, row.confusing_broken, row.build_next_note, row.build_next]
    .filter((t): t is string => Boolean(t && t.trim()))
    .map(t => t.trim())
}

function detectIntentTheme(row: CloudFeedbackRow): InsightTheme | null {
  const blob = collectTexts(row).join(' ')
  const m = blob.match(/\[(love|idea|bug|confused|wish|voice)\]/i)
  if (!m) return null
  const intent = m[1].toLowerCase()
  const labels: Record<string, { label: string; kind: InsightThemeKind }> = {
    love: { label: 'Love notes', kind: 'love' },
    idea: { label: 'Ideas', kind: 'wish' },
    bug: { label: 'Something isn’t working', kind: 'bug' },
    confused: { label: 'Confused moments', kind: 'confused' },
    wish: { label: 'Wishes', kind: 'wish' },
    voice: { label: 'Voice notes to Haven', kind: 'wish' },
  }
  const meta = labels[intent]
  if (!meta) return null
  return {
    id: `intent-${intent}`,
    label: meta.label,
    kind: meta.kind,
    count: 1,
    examples: collectTexts(row).slice(0, 1),
  }
}

function scoreSentiment(rows: CloudFeedbackRow[]): HelpHavenInsightReport['sentiment'] {
  if (rows.length === 0) {
    return {
      label: 'mixed',
      averageRating: null,
      recommendYesPct: null,
      summary: 'Haven is still waiting for the first Founders to share how they feel.',
    }
  }
  const avg = rows.reduce((s, r) => s + (r.rating || 0), 0) / rows.length
  const yes = rows.filter(r => r.recommend === 'yes').length
  const yesPct = Math.round((yes / rows.length) * 100)
  let label: 'warm' | 'mixed' | 'needs-care' = 'mixed'
  if (avg >= 4.2 && yesPct >= 60) label = 'warm'
  else if (avg < 3.4 || yesPct < 35) label = 'needs-care'

  const summary =
    label === 'warm'
      ? `Founders feel cared for — ${avg.toFixed(1)}★ on average, and ${yesPct}% would recommend Haven.`
      : label === 'needs-care'
        ? `Some Founders need more reassurance — ${avg.toFixed(1)}★ average. Listen closely to what’s confusing.`
        : `Sentiment is mixed but useful — ${avg.toFixed(1)}★ average, ${yesPct}% would recommend Haven so far.`

  return { label, averageRating: Math.round(avg * 10) / 10, recommendYesPct: yesPct, summary }
}

function buildThemes(rows: CloudFeedbackRow[]): InsightTheme[] {
  const map = new Map<string, InsightTheme>()

  for (const row of rows) {
    const intentTheme = detectIntentTheme(row)
    if (intentTheme) {
      const existing = map.get(intentTheme.id)
      if (existing) {
        existing.count += 1
        for (const ex of intentTheme.examples) {
          if (existing.examples.length < 3 && !existing.examples.includes(ex)) {
            existing.examples.push(ex)
          }
        }
      } else {
        map.set(intentTheme.id, intentTheme)
      }
    }

    const texts = collectTexts(row)
    if (row.build_next && BUILD_NEXT_LABELS[row.build_next]) {
      const id = `next-${row.build_next}`
      const existing = map.get(id)
      const example = row.build_next_note?.trim() || BUILD_NEXT_LABELS[row.build_next]
      if (existing) {
        existing.count += 1
        if (example && existing.examples.length < 3 && !existing.examples.includes(example)) {
          existing.examples.push(example)
        }
      } else {
        map.set(id, {
          id,
          label: `Learn next: ${BUILD_NEXT_LABELS[row.build_next]}`,
          kind: 'wish',
          count: 1,
          examples: example ? [example] : [],
        })
      }
    }

    for (const text of texts) {
      for (const rule of THEME_RULES) {
        if (!rule.match.test(text)) continue
        const existing = map.get(rule.id)
        if (existing) {
          existing.count += 1
          if (existing.examples.length < 3 && !existing.examples.includes(text)) {
            existing.examples.push(text)
          }
        } else {
          map.set(rule.id, {
            id: rule.id,
            label: rule.label,
            kind: row.confusing_broken && rule.kind === 'wish' ? 'confused' : rule.kind,
            count: 1,
            examples: [text],
          })
        }
      }
    }

    if (row.confusing_broken?.trim() && !THEME_RULES.some(r => r.match.test(row.confusing_broken!))) {
      const id = 'general-confused'
      const existing = map.get(id)
      const text = row.confusing_broken.trim()
      if (existing) {
        existing.count += 1
        if (existing.examples.length < 3) existing.examples.push(text)
      } else {
        map.set(id, {
          id,
          label: 'Needs a gentler path',
          kind: 'confused',
          count: 1,
          examples: [text],
        })
      }
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 8)
}

function buildDuplicates(themes: InsightTheme[]): HelpHavenInsightReport['duplicates'] {
  return themes
    .filter(t => t.count >= 2)
    .slice(0, 5)
    .map(t => ({
      theme: t.label,
      count: t.count,
      note:
        t.count >= 4
          ? `${t.count} Founders circled the same idea — strong signal.`
          : `${t.count} mentions point the same direction.`,
    }))
}

function buildPriorities(
  themes: InsightTheme[],
  rows: CloudFeedbackRow[],
): InsightPriority[] {
  const fromThemes = themes
    .filter(t => t.kind === 'wish' || t.kind === 'bug' || t.kind === 'confused')
    .slice(0, 5)
    .map((t, i) => ({
      rank: i + 1,
      title: t.label.replace(/^Learn next:\s*/i, ''),
      why:
        t.kind === 'bug'
          ? 'Something felt off more than once — worth a calm fix.'
          : t.kind === 'confused'
            ? 'Founders got lost here — clarity reduces mental load.'
            : 'Founders asked Haven to grow here next.',
      signals: t.count,
    }))

  if (fromThemes.length > 0) return fromThemes

  const buildVotes = new Map<string, number>()
  for (const row of rows) {
    if (!row.build_next) continue
    buildVotes.set(row.build_next, (buildVotes.get(row.build_next) ?? 0) + 1)
  }
  return [...buildVotes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, count], i) => ({
      rank: i + 1,
      title: BUILD_NEXT_LABELS[id] ?? id,
      why: 'Top “learn next” vote from Help Haven Learn.',
      signals: count,
    }))
}

function buildBugs(rows: CloudFeedbackRow[]): HelpHavenInsightReport['bugs'] {
  return rows
    .filter(r => r.confusing_broken?.trim())
    .slice(0, 8)
    .map(r => ({
      text: r.confusing_broken!.trim(),
      who: whoLabel(r),
      when: formatWhen(r.created_at),
    }))
}

function buildPraise(rows: CloudFeedbackRow[]): HelpHavenInsightReport['praise'] {
  return rows
    .filter(r => r.working_well?.trim() && r.rating >= 4)
    .slice(0, 6)
    .map(r => ({
      text: r.working_well!.trim(),
      who: whoLabel(r),
    }))
}

function buildNarrative(report: Omit<HelpHavenInsightReport, 'narrative' | 'llmNote'>): string {
  if (report.responseCount === 0) {
    return 'No Help Haven Learn notes yet. When Founders tap the leaf, their feelings will gather here — calmly, for you alone.'
  }

  const top = report.priorities[0]
  const love = report.themes.find(t => t.kind === 'love')
  const parts = [
    report.sentiment.summary,
    top
      ? `If I were gently steering the next slice, I’d start with ${top.title.toLowerCase()} (${top.signals} signal${top.signals === 1 ? '' : 's'}).`
      : 'There isn’t a loud priority yet — keep listening.',
    love
      ? `What’s already landing: ${love.examples[0] ?? love.label}.`
      : report.praise[0]
        ? `A Founder said: “${report.praise[0].text}”`
        : 'Praise is still light — every star still teaches Haven.',
    report.bugs.length > 0
      ? `${report.bugs.length} note${report.bugs.length === 1 ? '' : 's'} mention confusion or friction — skim those first.`
      : 'No sharp friction notes in this batch.',
  ]
  return parts.join(' ')
}

function buildHeadline(sentiment: HelpHavenInsightReport['sentiment'], count: number): string {
  if (count === 0) return 'Still getting to know your Founders'
  if (sentiment.label === 'warm') return 'Founders are teaching Haven with care'
  if (sentiment.label === 'needs-care') return 'A few Founders need a softer path'
  return 'Clear signals from Help Haven Learn'
}

/**
 * Local “AI” summarization — clusters, sentiment, and priorities without a network call.
 * Always available offline for Lisa’s dashboard.
 */
export function summarizeHelpHavenLearn(rows: CloudFeedbackRow[]): HelpHavenInsightReport {
  const sentiment = scoreSentiment(rows)
  const themes = buildThemes(rows)
  const duplicates = buildDuplicates(themes)
  const priorities = buildPriorities(themes, rows)
  const bugs = buildBugs(rows)
  const praise = buildPraise(rows)
  const base = {
    generatedAt: new Date().toISOString(),
    mode: 'local-intelligence' as const,
    headline: buildHeadline(sentiment, rows.length),
    responseCount: rows.length,
    sentiment,
    themes,
    duplicates,
    priorities,
    bugs,
    praise,
  }
  return {
    ...base,
    narrative: buildNarrative(base),
  }
}

/**
 * Optional OpenAI polish when VITE_OPENAI_API_KEY is set. Falls back silently.
 */
export async function enhanceInsightNarrative(
  report: HelpHavenInsightReport,
  rows: CloudFeedbackRow[],
): Promise<HelpHavenInsightReport> {
  const key = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim()
  if (!key || rows.length === 0) return report

  const digest = rows.slice(0, 40).map(r => ({
    rating: r.rating,
    recommend: r.recommend,
    working: r.working_well,
    confusing: r.confusing_broken,
    next: r.build_next,
    note: r.build_next_note,
  }))

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 320,
        messages: [
          {
            role: 'system',
            content:
              'You help Lisa, founder of Haven (a calm household assistant). Summarize Help Haven Learn feedback in 3–5 short warm paragraphs. No bullet lists. No corporate tone. Mention themes, friction, and one recommended next priority. Never invent quotes.',
          },
          {
            role: 'user',
            content: `Local summary:\n${report.narrative}\n\nTop priorities: ${report.priorities.map(p => p.title).join(', ') || 'none'}\n\nRaw digest JSON:\n${JSON.stringify(digest)}`,
          },
        ],
      }),
    })
    if (!res.ok) {
      return {
        ...report,
        llmNote: 'Cloud polish unavailable — showing Haven’s local reading instead.',
      }
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) return report
    return {
      ...report,
      mode: 'llm-enhanced',
      narrative: text,
      llmNote: 'Polished with your OpenAI key.',
    }
  } catch {
    return {
      ...report,
      llmNote: 'Cloud polish skipped — local reading is ready.',
    }
  }
}

export async function buildHelpHavenInsightReport(
  rows: CloudFeedbackRow[],
  opts?: { enhance?: boolean },
): Promise<HelpHavenInsightReport> {
  const local = summarizeHelpHavenLearn(rows)
  if (opts?.enhance === false) return local
  return enhanceInsightNarrative(local, rows)
}
