import { nanoid } from 'nanoid';
import { normalizeChord, type Block, type Song } from '../types';

const BLOCK_LABEL_PATTERN = /^\d+[ºª°]|^(Bloco|Parte|Seção)\s+\S+|^[IVX]+[.)]/i;
const SONG_PATTERN =
  /(.*?)\s*-\s*([A-G][b#]?(?:m|maj|min|dim|aug|sus|add)?(?:\d+)?(?:\/[A-G][b#]?)?)$/i;

function createBlock(label: string): Block {
  return {
    id: nanoid(),
    label,
    songs: [],
  };
}

function createSong(name: string, chord?: string): Song {
  return {
    id: nanoid(),
    name,
    chord: normalizeChord(chord),
  };
}

export function parseRawText(raw: string): Block[] {
  const lines = raw.split(/\r?\n/).map((line) => line.trim());
  const blocks: Block[] = [];
  let currentBlock: Block | null = null;

  for (const line of lines) {
    if (!line) {
      continue;
    }

    if (BLOCK_LABEL_PATTERN.test(line)) {
      currentBlock = createBlock(line);
      blocks.push(currentBlock);
      continue;
    }

    if (!currentBlock) {
      currentBlock = createBlock('1º');
      blocks.push(currentBlock);
    }

    const match = line.match(SONG_PATTERN);
    if (match) {
      currentBlock.songs.push(createSong(match[1].trim(), match[2].trim()));
      continue;
    }

    currentBlock.songs.push(createSong(line));
  }

  return blocks;
}
