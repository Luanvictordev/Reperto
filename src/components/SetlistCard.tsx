import styles from './SetlistCard.module.css';
import type { SetlistSummary } from '../types';
import { countSongs } from '../types';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

interface SetlistCardProps {
  setlist: SetlistSummary;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export default function SetlistCard({
  setlist,
  onOpen,
  onDuplicate,
  onDelete,
}: SetlistCardProps) {
  const songs = countSongs(setlist.blocks);
  const createdLabel = dateFormatter.format(new Date(setlist.createdAt));

  return (
    <article
      className={styles.card}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className={styles.meta}>Criado em {createdLabel}</div>
      <h2 className={styles.title}>{setlist.title}</h2>
      <p className={styles.count}>
        {songs} {songs === 1 ? 'música' : 'músicas'}
      </p>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Abrir repertório"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          ✎
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Duplicar repertório"
          onClick={(event) => {
            event.stopPropagation();
            onDuplicate();
          }}
        >
          ⎘
        </button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Excluir repertório"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          ✕
        </button>
      </div>
    </article>
  );
}
