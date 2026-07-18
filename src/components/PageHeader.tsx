import styles from './PageHeader.module.css'

interface PageHeaderProps {
  icon?: string
  title: string
  subtitle?: string
  /**
   * welcome — cream/forest companion strip (matches Kitchen / Money / Life heroes).
   * default — lighter page title for nested/utility contexts.
   */
  variant?: 'default' | 'welcome'
}

export function PageHeader({
  icon,
  title,
  subtitle,
  variant = 'welcome',
}: PageHeaderProps) {
  const welcome = variant === 'welcome'

  return (
    <header className={welcome ? styles.welcome : styles.header} aria-label={title}>
      {welcome ? (
        <>
          {icon ? <span className={styles.welcomeIcon} aria-hidden>{icon}</span> : null}
          <div className={styles.welcomeCopy}>
            <h2 className={styles.welcomeTitle}>{title}</h2>
            {subtitle ? <p className={styles.welcomeSubtitle}>{subtitle}</p> : null}
          </div>
        </>
      ) : (
        <>
          {icon ? <span className={styles.icon} aria-hidden>{icon}</span> : null}
          <div>
            <h2 className={styles.title}>{title}</h2>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
        </>
      )}
    </header>
  )
}
