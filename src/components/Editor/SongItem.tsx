import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Song } from '../../types';
import { isValidChord } from '../../types';
import styles from './SongItem.module.css';

interface SongItemProps {
  song: Song;
  truncateAt: number;
  onNameChange: (name: string) => void;
  onChordChange: (chord: string) => void;
  onChordBlur: () => void;
  onDelete: () => void;
}

export default function SongItem({
  song,
  truncateAt,
  onNameChange,
  onChordChange,
  onChordBlur,
  onDelete,
}: SongItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: song.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const showTruncation = truncateAt > 0 && song.name.length > truncateAt;
  const chordIsValid = isValidChord(song.chord);

  return (
    <div ref={setNodeRef} style={style} className={styles.row} data-dragging={isDragging}>
      <button type="button" className={`${styles.handle} drag-handle`} {...attributes} {...listeners}>
        {'\u283F'}
      </button>

      <div className={styles.nameWrap}>
        <input
          value={song.name}
          className={styles.nameInput}
          placeholder={'Nome da m\u00FAsica'}
          onChange={(event) => onNameChange(event.target.value)}
        />
        {showTruncation ? <span className={styles.truncationHint}>{'\u2026'}</span> : null}
      </div>

      <span className={styles.separator}>{'\u2013'}</span>

      <input
        value={song.chord ?? ''}
        className={`${styles.chordInput} ${!chordIsValid ? styles.invalidChord : ''}`}
        placeholder="Tom"
        onChange={(event) => onChordChange(event.target.value)}
        onBlur={onChordBlur}
      />

      <button type="button" className={styles.deleteButton} onClick={onDelete} aria-label={'Excluir m\u00FAsica'}>
        {'\u2715'}
      </button>
    </div>
  );
}

export function SongItemOverlay({ song }: { song: Song }) {
  return (
    <div className={`${styles.row} ${styles.overlay}`}>
      <span className={styles.handle}>{'\u283F'}</span>
      <div className={styles.overlayName}>{song.name || 'M\u00FAsica sem t\u00EDtulo'}</div>
      <span className={styles.separator}>{'\u2013'}</span>
      <div className={styles.overlayChord}>{song.chord || ''}</div>
    </div>
  );
}
