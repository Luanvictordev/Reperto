import { CSS } from '@dnd-kit/utilities';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Block } from '../../types';
import SongItem from './SongItem';
import styles from './BlockItem.module.css';

interface BlockItemProps {
  block: Block;
  collapsed: boolean;
  truncateAt: number;
  onLabelChange: (label: string) => void;
  onToggleCollapsed: () => void;
  onAddSong: () => void;
  onDelete: () => void;
  onSongNameChange: (songId: string, name: string) => void;
  onSongChordChange: (songId: string, chord: string) => void;
  onSongChordBlur: (songId: string) => void;
  onDeleteSong: (songId: string) => void;
}

export default function BlockItem({
  block,
  collapsed,
  truncateAt,
  onLabelChange,
  onToggleCollapsed,
  onAddSong,
  onDelete,
  onSongNameChange,
  onSongChordChange,
  onSongChordBlur,
  onDeleteSong,
}: BlockItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <section ref={setNodeRef} style={style} className={styles.block} data-dragging={isDragging}>
      <div className={styles.header}>
        <button type="button" className={`${styles.handle} drag-handle`} {...attributes} {...listeners}>
          {'\u283F'}
        </button>

        <input
          value={block.label}
          className={styles.labelInput}
          style={{ width: `${Math.max(block.label.length + 1, 4)}ch` }}
          onChange={(event) => onLabelChange(event.target.value)}
        />

        <span className={styles.badge}>{block.songs.length}</span>

        <div className={styles.actions}>
          <button type="button" className={styles.actionButton} onClick={onAddSong}>
            {'+ M\u00FAsica'}
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onToggleCollapsed}
            aria-label="Expandir ou recolher bloco"
          >
            {collapsed ? '\u25B8' : '\u25BE'}
          </button>
          <button type="button" className={styles.iconButton} onClick={onDelete} aria-label="Excluir bloco">
            {'\u2715'}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <SortableContext items={block.songs.map((song) => song.id)} strategy={verticalListSortingStrategy}>
          <div className={styles.songs}>
            {block.songs.length === 0 ? (
              <div className={styles.emptyBlock}>{'Arraste m\u00FAsicas para c\u00E1 ou use "+ M\u00FAsica".'}</div>
            ) : (
              block.songs.map((song) => (
                <SongItem
                  key={song.id}
                  song={song}
                  truncateAt={truncateAt}
                  onNameChange={(name) => onSongNameChange(song.id, name)}
                  onChordChange={(chord) => onSongChordChange(song.id, chord)}
                  onChordBlur={() => onSongChordBlur(song.id)}
                  onDelete={() => onDeleteSong(song.id)}
                />
              ))
            )}
          </div>
        </SortableContext>
      ) : null}
    </section>
  );
}

export function BlockItemOverlay({ block }: { block: Block }) {
  return (
    <div className={`${styles.block} ${styles.overlay}`}>
      <div className={styles.header}>
        <span className={styles.handle}>{'\u283F'}</span>
        <span className={styles.overlayLabel}>{block.label}</span>
        <span className={styles.badge}>{block.songs.length}</span>
      </div>
    </div>
  );
}
