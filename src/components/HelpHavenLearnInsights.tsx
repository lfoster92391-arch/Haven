import type { HelpHavenInsightReport } from '../lib/beta/helpHavenLearnInsights'
import styles from './HelpHavenLearnInsights.module.css'

export interface HelpHavenLearnInsightsProps {
  report: HelpHavenInsightReport
  enhancing?: boolean
  onRefreshEnhance?: () => void
  /** Override eyebrow; defaults from audience */
  eyebrow?: string
  compact?: boolean
}

function sentimentClass(label: HelpHavenInsightReport['sentiment']['label']): string {
  if (label === 'warm') return styles.sentWarm
  if (label === 'needs-care') return styles.sentCare
  return styles.sentMixed
}

export function HelpHavenLearnInsights({
  report,
  enhancing,
  onRefreshEnhance,
  eyebrow,
  compact,
}: HelpHavenLearnInsightsProps) {
  const member = report.audience === 'member'
  const defaultEyebrow = member ? '🌿 Your insight' : '🌿 Community signals'

  return (
    <div className={`${styles.wrap} ${compact ? styles.compact : ''}`}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>{eyebrow ?? defaultEyebrow}</p>
        <h2 className={styles.headline}>{report.headline}</h2>
        <p className={styles.narrative}>{report.narrative}</p>
        <div className={styles.metaRow}>
          <span className={`${styles.sentPill} ${sentimentClass(report.sentiment.label)}`}>
            {report.sentiment.label === 'warm'
              ? 'Warm'
              : report.sentiment.label === 'needs-care'
                ? 'Needs care'
                : 'Mixed'}
          </span>
          <span className={styles.meta}>
            {report.responseCount} note{report.responseCount === 1 ? '' : 's'}
            {report.sentiment.averageRating != null
              ? ` · ${report.sentiment.averageRating}★`
              : ''}
            {report.mode === 'llm-enhanced' ? ' · Polished' : ' · Haven’s reading'}
          </span>
          {onRefreshEnhance && (
            <button
              type="button"
              className={styles.polishBtn}
              onClick={onRefreshEnhance}
              disabled={enhancing}
            >
              {enhancing ? 'Listening…' : 'Polish with AI'}
            </button>
          )}
        </div>
        {report.llmNote && <p className={styles.llmNote}>{report.llmNote}</p>}
      </header>

      {!compact && report.priorities.length > 0 && (
        <section className={styles.section} aria-label={member ? 'What you asked for next' : 'Suggested priorities'}>
          <h3 className={styles.sectionTitle}>
            {member ? 'What you’ve asked for next' : 'Suggested next priorities'}
          </h3>
          <ol className={styles.priorityList}>
            {report.priorities.map(p => (
              <li key={p.rank} className={styles.priorityItem}>
                <span className={styles.rank}>{p.rank}</span>
                <div>
                  <p className={styles.priorityTitle}>{p.title}</p>
                  <p className={styles.priorityWhy}>
                    {p.why} · {p.signals} signal{p.signals === 1 ? '' : 's'}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {!compact && report.duplicates.length > 0 && (
        <section className={styles.section} aria-label="Repeated themes">
          <h3 className={styles.sectionTitle}>
            {member ? 'Themes you return to' : 'Repeated themes'}
          </h3>
          <ul className={styles.themeList}>
            {report.duplicates.map(d => (
              <li key={d.theme} className={styles.themeItem}>
                <strong>{d.theme}</strong>
                <span className={styles.themeCount}>×{d.count}</span>
                <p className={styles.themeNote}>{d.note}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!compact && (
        <div className={styles.split}>
          {report.praise.length > 0 && (
            <section className={styles.section} aria-label={member ? 'What you loved' : 'What’s landing'}>
              <h3 className={styles.sectionTitle}>
                {member ? 'What you loved' : 'What’s landing'}
              </h3>
              <ul className={styles.quoteList}>
                {report.praise.map((p, i) => (
                  <li key={`${p.who}-${i}`}>
                    <p className={styles.quote}>“{p.text}”</p>
                    <p className={styles.quoteWho}>{p.who}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {report.bugs.length > 0 && (
            <section className={styles.section} aria-label={member ? 'What felt off' : 'Friction to tend'}>
              <h3 className={styles.sectionTitle}>
                {member ? 'What felt off' : 'Friction to tend'}
              </h3>
              <ul className={styles.quoteList}>
                {report.bugs.map((b, i) => (
                  <li key={`${b.when}-${i}`}>
                    <p className={styles.quote}>{b.text}</p>
                    <p className={styles.quoteWho}>
                      {b.who} · {b.when}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {!compact && report.themes.length > 0 && (
        <section className={styles.section} aria-label="All themes">
          <h3 className={styles.sectionTitle}>Theme map</h3>
          <ul className={styles.chipCloud}>
            {report.themes.map(t => (
              <li key={t.id} className={styles.chip}>
                {t.label}
                <span className={styles.chipCount}>{t.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {compact && report.priorities[0] && (
        <p className={styles.compactNext}>
          Clearest next ask: <strong>{report.priorities[0].title}</strong>
        </p>
      )}
    </div>
  )
}
