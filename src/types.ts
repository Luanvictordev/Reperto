export interface Song {
  id: string;
  name: string;
  chord?: string;
}

export interface Block {
  id: string;
  label: string;
  songs: Song[];
}

export type PrintFont = 'Georgia' | 'Times New Roman' | 'Arial' | 'Courier New' | 'Trebuchet MS';

export interface PrintSettings {
  font: PrintFont;
  titleSize: number;
  blockSize: number;
  songSize: number;
  lineSpacing: number;
  columns: 1 | 2 | 3;
  truncateAt: number;
  chordColor: string;
  chordInline: boolean;
}

export interface Setlist {
  id?: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  blocks: Block[];
  settings: PrintSettings;
}

export interface SetlistSummary extends Setlist {
  id: number;
}

export interface ToastMessage {
  id: string;
  message: string;
  tone: 'success' | 'error' | 'info';
}

export const PRINT_FONTS: PrintFont[] = [
  'Georgia',
  'Times New Roman',
  'Arial',
  'Courier New',
  'Trebuchet MS',
];

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  font: 'Georgia',
  titleSize: 26,
  blockSize: 14,
  songSize: 14,
  lineSpacing: 1.5,
  columns: 2,
  truncateAt: 0,
  chordColor: '#c0392b',
  chordInline: false,
};

export const CHORD_COLOR_PRESETS = [
  '#c0392b',
  '#1a1916',
  '#8b1e3f',
  '#2d6a4f',
  '#1f4e5f',
  '#7f5539',
  '#3d405b',
  '#b56576',
];

export const DEFAULT_SETLIST_TITLE = 'Novo repert\u00F3rio';

export const CHORD_PATTERN =
  /^[A-G](?:b|#)?(?:(?:m|maj|min|dim|aug|sus|add)\d*|\d+)?(?:\/[A-G](?:b|#)?)?$/i;

export function normalizeChord(chord?: string) {
  const trimmed = chord?.trim();
  if (!trimmed) {
    return undefined;
  }

  const match = trimmed.match(/^([A-Ga-g])(b|#)?(.*?)(?:\/([A-Ga-g])(b|#)?)?$/);
  if (!match) {
    return trimmed;
  }

  const [, root, accidental, suffix, bassRoot, bassAccidental] = match;
  const normalizedMain = `${root.toUpperCase()}${accidental ?? ''}${suffix.replace(/\s+/g, '').toLowerCase()}`;
  if (!bassRoot) {
    return normalizedMain;
  }

  return `${normalizedMain}/${bassRoot.toUpperCase()}${bassAccidental ?? ''}`;
}

export function isValidChord(chord?: string) {
  if (!chord) {
    return true;
  }

  return CHORD_PATTERN.test(normalizeChord(chord) ?? '');
}

export function countSongs(blocks: Block[]) {
  return blocks.reduce((total, block) => total + block.songs.length, 0);
}

export function truncateSongName(name: string, limit: number) {
  if (!limit || name.length <= limit) {
    return name;
  }

  return `${name.slice(0, Math.max(0, limit - 1)).trimEnd()}\u2026`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeFont(value?: string): PrintFont {
  if (value && PRINT_FONTS.includes(value as PrintFont)) {
    return value as PrintFont;
  }

  return DEFAULT_PRINT_SETTINGS.font;
}

export function normalizeLineSpacing(value: unknown, songSize = DEFAULT_PRINT_SETTINGS.songSize) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_PRINT_SETTINGS.lineSpacing;
  }

  const normalized = value > 4 ? value / Math.max(songSize, 10) : value;
  return Number(clamp(normalized, 1, 2.5).toFixed(1));
}

export function normalizePrintSettings(
  settings?: Partial<PrintSettings> & {
    lineHeight?: number;
  },
): PrintSettings {
  const nextSongSize = clamp(settings?.songSize ?? DEFAULT_PRINT_SETTINGS.songSize, 10, 20);
  const nextColumns = settings?.columns ?? DEFAULT_PRINT_SETTINGS.columns;
  const nextTruncateAt = settings?.truncateAt ?? DEFAULT_PRINT_SETTINGS.truncateAt;

  return {
    font: normalizeFont(settings?.font),
    titleSize: clamp(settings?.titleSize ?? DEFAULT_PRINT_SETTINGS.titleSize, 16, 42),
    blockSize: clamp(settings?.blockSize ?? DEFAULT_PRINT_SETTINGS.blockSize, 11, 20),
    songSize: nextSongSize,
    lineSpacing: normalizeLineSpacing(settings?.lineSpacing ?? settings?.lineHeight, nextSongSize),
    columns: [1, 2, 3].includes(nextColumns) ? (nextColumns as PrintSettings['columns']) : DEFAULT_PRINT_SETTINGS.columns,
    truncateAt: [0, 18, 22, 28].includes(nextTruncateAt) ? nextTruncateAt : DEFAULT_PRINT_SETTINGS.truncateAt,
    chordColor:
      typeof settings?.chordColor === 'string' && settings.chordColor.trim().length > 0
        ? settings.chordColor
        : DEFAULT_PRINT_SETTINGS.chordColor,
    chordInline: Boolean(settings?.chordInline),
  };
}

export function normalizeSetlist<T extends Setlist>(setlist: T): T {
  return {
    ...setlist,
    settings: normalizePrintSettings(setlist.settings),
  };
}
