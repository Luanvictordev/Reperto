import { useState } from 'react';
import {
  closestCorners,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { confirm } from '@tauri-apps/plugin-dialog';
import type { Block, Song } from '../../types';
import { useSetlistStore } from '../../store/useSetlistStore';
import BlockItem, { BlockItemOverlay } from './BlockItem';
import { SongItemOverlay } from './SongItem';
import styles from './VisualEditor.module.css';

function findBlockContainingSong(blocks: Block[], songId: string) {
  return blocks.find((block) => block.songs.some((song) => song.id === songId));
}

function moveSongBetweenBlocks(blocks: Block[], activeId: string, overId: string) {
  const activeBlock = findBlockContainingSong(blocks, activeId);
  const overBlock = findBlockContainingSong(blocks, overId) ?? blocks.find((block) => block.id === overId);

  if (!activeBlock || !overBlock || activeBlock.id === overBlock.id) {
    return blocks;
  }

  const activeIndex = activeBlock.songs.findIndex((song) => song.id === activeId);
  if (activeIndex < 0) {
    return blocks;
  }

  const songToMove = activeBlock.songs[activeIndex];
  const insertIndex = overBlock.songs.findIndex((song) => song.id === overId);

  return blocks.map((block) => {
    if (block.id === activeBlock.id) {
      return {
        ...block,
        songs: block.songs.filter((song) => song.id !== activeId),
      };
    }

    if (block.id === overBlock.id) {
      const nextSongs = [...block.songs];
      nextSongs.splice(insertIndex >= 0 ? insertIndex : nextSongs.length, 0, songToMove);
      return {
        ...block,
        songs: nextSongs,
      };
    }

    return block;
  });
}

export default function VisualEditor() {
  const blocks = useSetlistStore((state) => state.currentSetlist.blocks);
  const collapsedBlockIds = useSetlistStore((state) => state.collapsedBlockIds);
  const truncateAt = useSetlistStore((state) => state.currentSetlist.settings.truncateAt);
  const replaceBlocks = useSetlistStore((state) => state.replaceBlocks);
  const addBlock = useSetlistStore((state) => state.addBlock);
  const addSong = useSetlistStore((state) => state.addSong);
  const updateBlockLabel = useSetlistStore((state) => state.updateBlockLabel);
  const deleteBlock = useSetlistStore((state) => state.deleteBlock);
  const toggleBlockCollapsed = useSetlistStore((state) => state.toggleBlockCollapsed);
  const updateSong = useSetlistStore((state) => state.updateSong);
  const normalizeSongChord = useSetlistStore((state) => state.normalizeSongChord);
  const deleteSong = useSetlistStore((state) => state.deleteSong);

  const [activeSong, setActiveSong] = useState<Song | null>(null);
  const [activeBlock, setActiveBlock] = useState<Block | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  function handleDragStart({ active }: DragStartEvent) {
    const block = blocks.find((item) => item.id === active.id);
    if (block) {
      setActiveBlock(block);
      return;
    }

    const song = blocks.flatMap((blockItem) => blockItem.songs).find((item) => item.id === active.id);
    if (song) {
      setActiveSong(song);
    }
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) {
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    const isBlockDrag = blocks.some((block) => block.id === activeId);

    if (isBlockDrag) {
      return;
    }

    const nextBlocks = moveSongBetweenBlocks(blocks, activeId, overId);
    if (nextBlocks !== blocks) {
      replaceBlocks(nextBlocks);
    }
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveSong(null);
    setActiveBlock(null);

    if (!over) {
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) {
      return;
    }

    const isBlockDrag = blocks.some((block) => block.id === activeId);
    if (isBlockDrag) {
      const from = blocks.findIndex((block) => block.id === activeId);
      const to = blocks.findIndex((block) => block.id === overId);
      if (from >= 0 && to >= 0) {
        replaceBlocks(arrayMove(blocks, from, to));
      }
      return;
    }

    const songBlock = findBlockContainingSong(blocks, activeId);
    if (!songBlock) {
      return;
    }

    const from = songBlock.songs.findIndex((song) => song.id === activeId);
    const to = songBlock.songs.findIndex((song) => song.id === overId);
    if (from < 0 || to < 0) {
      return;
    }

    replaceBlocks(
      blocks.map((block) =>
        block.id === songBlock.id
          ? {
              ...block,
              songs: arrayMove(block.songs, from, to),
            }
          : block,
      ),
    );
  }

  async function handleDeleteBlock(blockId: string, songsCount: number) {
    if (songsCount > 0) {
      const approved = await confirm('Este bloco tem m\u00FAsicas. Deseja remov\u00EA-lo mesmo assim?', {
        title: 'Excluir bloco',
        kind: 'warning',
      });

      if (!approved) {
        return;
      }
    }

    deleteBlock(blockId);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
          <div className={styles.list}>
            {blocks.map((block) => (
              <BlockItem
                key={block.id}
                block={block}
                collapsed={collapsedBlockIds.includes(block.id)}
                truncateAt={truncateAt}
                onLabelChange={(label) => updateBlockLabel(block.id, label)}
                onToggleCollapsed={() => toggleBlockCollapsed(block.id)}
                onAddSong={() => addSong(block.id)}
                onDelete={() => void handleDeleteBlock(block.id, block.songs.length)}
                onSongNameChange={(songId, name) => updateSong(block.id, songId, { name })}
                onSongChordChange={(songId, chord) => updateSong(block.id, songId, { chord })}
                onSongChordBlur={(songId) => normalizeSongChord(block.id, songId)}
                onDeleteSong={(songId) => deleteSong(block.id, songId)}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeSong ? <SongItemOverlay song={activeSong} /> : null}
          {activeBlock ? <BlockItemOverlay block={activeBlock} /> : null}
        </DragOverlay>
      </DndContext>

      <button type="button" className={styles.addBlockButton} onClick={addBlock}>
        + Adicionar Bloco
      </button>
    </>
  );
}
