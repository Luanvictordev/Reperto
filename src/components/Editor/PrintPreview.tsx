import {
  closestCorners,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createPortal } from 'react-dom';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { Setlist } from '../../types';
import { DEFAULT_SETLIST_TITLE, truncateSongName } from '../../types';
import { buildPreviewPages } from '../../lib/previewLayout';
import { useSetlistStore } from '../../store/useSetlistStore';
import styles from './PrintPreview.module.css';

interface PrintPreviewProps {
  setlist: Setlist;
}

type EditingState =
  | { type: 'title'; value: string }
  | { type: 'block'; blockId: string; value: string }
  | { type: 'songName'; blockId: string; songId: string; value: string }
  | { type: 'songChord'; blockId: string; songId: string; value: string };

interface PreviewColumnState {
  id: string;
  pageIndex: number;
  columnIndex: number;
  blockIds: string[];
}

const COLUMN_GAP_PX = 30;
const SONG_PLACEHOLDER = 'Musica sem titulo';

function alignClassName(align: 'left' | 'center' | 'right') {
  return styles[`align${align[0].toUpperCase()}${align.slice(1)}`];
}

function resolveDisplayValue(value: string, displayValue?: string, placeholder?: string) {
  const nextValue = displayValue ?? value;
  return nextValue.trim().length > 0 ? nextValue : placeholder;
}

function createPreviewColumns(pages: ReturnType<typeof buildPreviewPages>) {
  return pages.flatMap((page, pageIndex) =>
    page.columns.map((column, columnIndex) => ({
      id: `preview-column-${pageIndex}-${columnIndex}`,
      pageIndex,
      columnIndex,
      blockIds: column.map(({ block }) => block.id),
    })),
  );
}

function findColumnByItem(columns: PreviewColumnState[], itemId: string) {
  return columns.find((column) => column.id === itemId || column.blockIds.includes(itemId));
}

function EditableText({
  active,
  className,
  value,
  displayValue,
  placeholder,
  onStart,
  onChange,
  onCommit,
  onCancel,
  align = 'left',
  style,
  widthMode = 'full',
}: {
  active: boolean;
  className: string;
  value: string;
  displayValue?: string;
  placeholder?: string;
  onStart: () => void;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  align?: 'left' | 'center' | 'right';
  style?: CSSProperties;
  widthMode?: 'full' | 'content';
}) {
  const alignClass = alignClassName(align);
  const widthClass = widthMode === 'content' ? styles.widthContent : styles.widthFull;
  const sharedClassName = `${className} ${alignClass} ${widthClass}`;

  if (active) {
    return (
      <input
        autoFocus
        value={value}
        size={widthMode === 'content' ? Math.max(4, value.length || placeholder?.length || 0) : undefined}
        className={`${styles.editInput} ${sharedClassName}`}
        style={style}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onCommit();
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`${styles.editableText} ${sharedClassName}`}
      style={style}
      onClick={onStart}
      title="Clique para editar"
    >
      {resolveDisplayValue(value, displayValue, placeholder)}
    </button>
  );
}

function PreviewColumn({
  containerId,
  blockIds,
  children,
}: {
  containerId: string;
  blockIds: string[];
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: containerId,
  });

  return (
    <div ref={setNodeRef} className={styles.column} data-over={isOver}>
      <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      {blockIds.length === 0 ? <div className={styles.emptyColumn} /> : null}
    </div>
  );
}

function PreviewBlockBody({
  setlist,
  block,
  editing,
  setEditing,
  commitEditing,
  cancelEditing,
  interactive,
  dragHandle,
}: {
  setlist: Setlist;
  block: Setlist['blocks'][number];
  editing: EditingState | null;
  setEditing: (value: EditingState | null) => void;
  commitEditing: () => void;
  cancelEditing: () => void;
  interactive: boolean;
  dragHandle?: ReactNode;
}) {
  const { settings } = setlist;

  return (
    <>
      {interactive ? (
        <div className={styles.blockHeader}>
          {dragHandle}
          <EditableText
            active={editing?.type === 'block' && editing.blockId === block.id}
            className={styles.blockLabel}
            value={editing?.type === 'block' && editing.blockId === block.id ? editing.value : block.label}
            widthMode="full"
            style={{ fontSize: `${settings.blockSize}px` }}
            onStart={() => setEditing({ type: 'block', blockId: block.id, value: block.label })}
            onChange={(value) => setEditing({ type: 'block', blockId: block.id, value })}
            onCommit={commitEditing}
            onCancel={cancelEditing}
          />
        </div>
      ) : (
        <h2
          className={styles.blockLabel}
          style={{
            fontSize: `${settings.blockSize}px`,
          }}
        >
          {block.label}
        </h2>
      )}

      <div
        className={styles.songList}
        style={{
          lineHeight: settings.lineSpacing,
        }}
      >
        {block.songs.map((song) => {
          const truncatedName = truncateSongName(song.name, settings.truncateAt);
          const hasChord = Boolean(song.chord?.trim());
          const inlineChord = hasChord && settings.chordInline;

          return (
            <div
              key={`song-${song.id}`}
              className={`${styles.songRow} ${inlineChord ? styles.songRowInline : ''}`}
              style={{
                fontSize: `${settings.songSize}px`,
              }}
            >
              {interactive ? (
                <EditableText
                  active={editing?.type === 'songName' && editing.blockId === block.id && editing.songId === song.id}
                  className={`${styles.songName} ${inlineChord ? styles.songNameInline : ''}`}
                  value={
                    editing?.type === 'songName' && editing.blockId === block.id && editing.songId === song.id
                      ? editing.value
                      : song.name
                  }
                  displayValue={truncatedName}
                  placeholder={SONG_PLACEHOLDER}
                  widthMode={inlineChord ? 'content' : 'full'}
                  onStart={() =>
                    setEditing({
                      type: 'songName',
                      blockId: block.id,
                      songId: song.id,
                      value: song.name,
                    })
                  }
                  onChange={(value) =>
                    setEditing({
                      type: 'songName',
                      blockId: block.id,
                      songId: song.id,
                      value,
                    })
                  }
                  onCommit={commitEditing}
                  onCancel={cancelEditing}
                />
              ) : (
                <span className={`${styles.songName} ${inlineChord ? styles.songNameInline : ''}`}>
                  {truncatedName || SONG_PLACEHOLDER}
                </span>
              )}

              <span className={`${styles.songRight} ${inlineChord ? styles.songRightInline : ''}`}>
                {hasChord ? <span className={styles.songDash}>-</span> : null}
                {hasChord ? (
                  interactive ? (
                    <EditableText
                      active={
                        editing?.type === 'songChord' && editing.blockId === block.id && editing.songId === song.id
                      }
                      className={`${styles.songChord} song-chord`}
                      value={
                        editing?.type === 'songChord' && editing.blockId === block.id && editing.songId === song.id
                          ? editing.value
                          : song.chord ?? ''
                      }
                      align="right"
                      widthMode="content"
                      style={{ color: settings.chordColor }}
                      onStart={() =>
                        setEditing({
                          type: 'songChord',
                          blockId: block.id,
                          songId: song.id,
                          value: song.chord ?? '',
                        })
                      }
                      onChange={(value) =>
                        setEditing({
                          type: 'songChord',
                          blockId: block.id,
                          songId: song.id,
                          value,
                        })
                      }
                      onCommit={commitEditing}
                      onCancel={cancelEditing}
                    />
                  ) : (
                    <span className={`${styles.songChord} song-chord`} style={{ color: settings.chordColor }}>
                      {song.chord}
                    </span>
                  )
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SortablePreviewBlock({
  setlist,
  block,
  editing,
  setEditing,
  commitEditing,
  cancelEditing,
}: {
  setlist: Setlist;
  block: Setlist['blocks'][number];
  editing: EditingState | null;
  setEditing: (value: EditingState | null) => void;
  commitEditing: () => void;
  cancelEditing: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <section ref={setNodeRef} style={style} className={styles.block} data-dragging={isDragging}>
      <PreviewBlockBody
        setlist={setlist}
        block={block}
        editing={editing}
        setEditing={setEditing}
        commitEditing={commitEditing}
        cancelEditing={cancelEditing}
        interactive
        dragHandle={
          <button
            type="button"
            className={styles.dragHandle}
            title="Arraste para mover o bloco"
            aria-label="Arraste para mover o bloco"
            {...attributes}
            {...listeners}
          >
            {'\u283F'}
          </button>
        }
      />
    </section>
  );
}

function OverlayBlock({
  setlist,
  block,
}: {
  setlist: Setlist;
  block: Setlist['blocks'][number];
}) {
  return (
    <section className={`${styles.block} ${styles.dragOverlayBlock}`}>
      <PreviewBlockBody
        setlist={setlist}
        block={block}
        editing={null}
        setEditing={() => undefined}
        commitEditing={() => undefined}
        cancelEditing={() => undefined}
        interactive={false}
      />
    </section>
  );
}

function SheetPage({
  setlist,
  pageIndex,
  page,
  editing,
  setEditing,
  interactive,
}: {
  setlist: Setlist;
  pageIndex: number;
  page: ReturnType<typeof buildPreviewPages>[number];
  editing: EditingState | null;
  setEditing: (value: EditingState | null) => void;
  interactive: boolean;
}) {
  const { settings } = setlist;
  const updateTitle = useSetlistStore((state) => state.updateTitle);
  const updateBlockLabel = useSetlistStore((state) => state.updateBlockLabel);
  const updateSong = useSetlistStore((state) => state.updateSong);
  const normalizeSongChord = useSetlistStore((state) => state.normalizeSongChord);

  function cancelEditing() {
    setEditing(null);
  }

  function commitEditing() {
    if (!editing) {
      return;
    }

    if (editing.type === 'title') {
      updateTitle(editing.value);
    }

    if (editing.type === 'block') {
      updateBlockLabel(editing.blockId, editing.value);
    }

    if (editing.type === 'songName') {
      updateSong(editing.blockId, editing.songId, { name: editing.value });
    }

    if (editing.type === 'songChord') {
      updateSong(editing.blockId, editing.songId, { chord: editing.value });
      normalizeSongChord(editing.blockId, editing.songId);
    }

    setEditing(null);
  }

  return (
    <div
      className={`${styles.sheet} a4-sheet`}
      style={{
        fontFamily: settings.font,
      }}
    >
      {interactive ? (
        <EditableText
          active={editing?.type === 'title'}
          className={styles.sheetTitle}
          value={editing?.type === 'title' ? editing.value : setlist.title}
          placeholder={DEFAULT_SETLIST_TITLE}
          align="center"
          widthMode="full"
          style={{ fontSize: `${settings.titleSize}px` }}
          onStart={() => setEditing({ type: 'title', value: setlist.title })}
          onChange={(value) => setEditing({ type: 'title', value })}
          onCommit={commitEditing}
          onCancel={cancelEditing}
        />
      ) : (
        <h1
          className={styles.sheetTitle}
          style={{
            fontSize: `${settings.titleSize}px`,
          }}
        >
          {setlist.title || DEFAULT_SETLIST_TITLE}
        </h1>
      )}

      <div
        className={styles.columns}
        style={{
          gridTemplateColumns: `repeat(${settings.columns}, minmax(0, 1fr))`,
          gap: `${COLUMN_GAP_PX}px`,
        }}
      >
        {page.columns.map((column, columnIndex) => {
          const containerId = `preview-column-${pageIndex}-${columnIndex}`;

          if (!interactive) {
            return (
              <div key={containerId} className={styles.column}>
                {column.map(({ block }) => (
                  <section key={block.id} className={styles.block}>
                    <PreviewBlockBody
                      setlist={setlist}
                      block={block}
                      editing={editing}
                      setEditing={setEditing}
                      commitEditing={commitEditing}
                      cancelEditing={cancelEditing}
                      interactive={false}
                    />
                  </section>
                ))}
              </div>
            );
          }

          return (
            <PreviewColumn key={containerId} containerId={containerId} blockIds={column.map(({ block }) => block.id)}>
              {column.map(({ block }) => (
                <SortablePreviewBlock
                  key={block.id}
                  setlist={setlist}
                  block={block}
                  editing={editing}
                  setEditing={setEditing}
                  commitEditing={commitEditing}
                  cancelEditing={cancelEditing}
                />
              ))}
            </PreviewColumn>
          );
        })}
      </div>
    </div>
  );
}

export default function PrintPreview({ setlist }: PrintPreviewProps) {
  const printRoot = typeof document !== 'undefined' ? document.getElementById('print-root') : null;
  const pages = useMemo(() => buildPreviewPages(setlist), [setlist]);
  const replaceBlocks = useSetlistStore((state) => state.replaceBlocks);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const activeBlock = activeBlockId ? setlist.blocks.find((block) => block.id === activeBlockId) ?? null : null;

  function handleDragStart({ active }: DragStartEvent) {
    setEditing(null);
    setActiveBlockId(String(active.id));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveBlockId(null);

    if (!over) {
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) {
      return;
    }

    const nextColumns = createPreviewColumns(pages).map((column) => ({
      ...column,
      blockIds: [...column.blockIds],
    }));

    const activeColumn = findColumnByItem(nextColumns, activeId);
    const overColumn = findColumnByItem(nextColumns, overId);
    if (!activeColumn || !overColumn) {
      return;
    }

    const activeIndex = activeColumn.blockIds.indexOf(activeId);
    if (activeIndex < 0) {
      return;
    }

    if (activeColumn.id === overColumn.id) {
      const overIndex = overId === overColumn.id ? overColumn.blockIds.length - 1 : overColumn.blockIds.indexOf(overId);
      if (overIndex < 0 || activeIndex === overIndex) {
        return;
      }

      activeColumn.blockIds = arrayMove(activeColumn.blockIds, activeIndex, overIndex);
    } else {
      activeColumn.blockIds.splice(activeIndex, 1);

      let targetIndex = overId === overColumn.id ? overColumn.blockIds.length : overColumn.blockIds.indexOf(overId);
      if (targetIndex < 0) {
        targetIndex = overColumn.blockIds.length;
      }

      overColumn.blockIds.splice(targetIndex, 0, activeId);
    }

    const blockMap = new Map(setlist.blocks.map((block) => [block.id, block]));
    const nextBlocks = nextColumns
      .sort((left, right) =>
        left.pageIndex === right.pageIndex ? left.columnIndex - right.columnIndex : left.pageIndex - right.pageIndex,
      )
      .flatMap((column) =>
        column.blockIds.map((blockId) => ({
          ...blockMap.get(blockId)!,
          layout: {
            page: column.pageIndex,
            column: column.columnIndex,
          },
        })),
      );

    replaceBlocks(nextBlocks);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={styles.previewArea}>
          {pages.map((page, pageIndex) => (
            <div key={`preview-page-${pageIndex}`} className={`${styles.sheetWrapper} sheet-shadow-wrapper`}>
              <SheetPage
                setlist={setlist}
                pageIndex={pageIndex}
                page={page}
                editing={editing}
                setEditing={setEditing}
                interactive
              />
            </div>
          ))}
        </div>

        <DragOverlay>{activeBlock ? <OverlayBlock setlist={setlist} block={activeBlock} /> : null}</DragOverlay>
      </DndContext>

      {printRoot
        ? createPortal(
            <div className={styles.printMount}>
              {pages.map((page, index) => (
                <SheetPage
                  key={`print-page-${index}`}
                  setlist={setlist}
                  pageIndex={index}
                  page={page}
                  editing={null}
                  setEditing={() => undefined}
                  interactive={false}
                />
              ))}
            </div>,
            printRoot,
          )
        : null}
    </>
  );
}
