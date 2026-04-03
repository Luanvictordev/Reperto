import { useState, type ReactNode } from 'react';
import styles from './CollapsibleSection.module.css';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span className={styles.titleRow}>
          <span className={styles.chevron}>{open ? '\u25BC' : '\u25B6'}</span>
          <span>{title}</span>
        </span>
        <span className={styles.stateMark}>{open ? '\u2212' : '+'}</span>
      </button>

      <div className={`${styles.body} ${open ? styles.bodyOpen : styles.bodyClosed}`}>
        <div className={styles.bodyInner}>{children}</div>
      </div>
    </section>
  );
}
