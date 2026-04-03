import { nanoid } from 'nanoid';
import { create } from 'zustand';
import {
  deleteSetlist,
  duplicateSetlist,
  getAllSetlists,
  getSetlist,
  saveSetlist,
} from '../lib/db';
import { parseRawText } from '../lib/parser';
import {
  DEFAULT_PRINT_SETTINGS,
  DEFAULT_SETLIST_TITLE,
  normalizeChord,
  normalizePrintSettings,
  normalizeSetlist,
  type Block,
  type PrintSettings,
  type Setlist,
  type SetlistSummary,
  type Song,
  type ToastMessage,
} from '../types';

function nowIso() {
  return new Date().toISOString();
}

const RECENT_CHORD_COLORS_STORAGE_KEY = 'repertorio.recentChordColors';

function loadRecentChordColors() {
  if (typeof window === 'undefined') {
    return [DEFAULT_PRINT_SETTINGS.chordColor];
  }

  try {
    const raw = window.localStorage.getItem(RECENT_CHORD_COLORS_STORAGE_KEY);
    if (!raw) {
      return [DEFAULT_PRINT_SETTINGS.chordColor];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [DEFAULT_PRINT_SETTINGS.chordColor];
    }

    const validColors = parsed
      .filter((color): color is string => typeof color === 'string' && color.trim().length > 0)
      .map((color) => color.toLowerCase());

    return validColors.length > 0 ? validColors.slice(0, 8) : [DEFAULT_PRINT_SETTINGS.chordColor];
  } catch {
    return [DEFAULT_PRINT_SETTINGS.chordColor];
  }
}

function persistRecentChordColors(colors: string[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(RECENT_CHORD_COLORS_STORAGE_KEY, JSON.stringify(colors));
}

function pushRecentChordColor(colors: string[], nextColor?: string) {
  if (!nextColor) {
    return colors;
  }

  const normalized = nextColor.toLowerCase();
  const nextColors = [normalized, ...colors.filter((color) => color !== normalized)].slice(0, 8);
  persistRecentChordColors(nextColors);
  return nextColors;
}

function createDefaultSetlist(): Setlist {
  const now = nowIso();

  return {
    title: DEFAULT_SETLIST_TITLE,
    createdAt: now,
    updatedAt: now,
    blocks: [],
    settings: normalizePrintSettings(DEFAULT_PRINT_SETTINGS),
  };
}

function normalizePrefix(prefix: string) {
  const lower = prefix.toLowerCase();
  if (lower === 'bloco') {
    return 'Bloco';
  }
  if (lower === 'parte') {
    return 'Parte';
  }
  return 'Seção';
}

function nextAlpha(value: string) {
  const chars = value.toUpperCase().split('');
  let index = chars.length - 1;

  while (index >= 0 && chars[index] === 'Z') {
    chars[index] = 'A';
    index -= 1;
  }

  if (index < 0) {
    chars.unshift('A');
  } else {
    chars[index] = String.fromCharCode(chars[index].charCodeAt(0) + 1);
  }

  return chars.join('');
}

function romanToInt(value: string) {
  const romanMap: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
  };

  return value
    .toUpperCase()
    .split('')
    .reduce((total, char, index, chars) => {
      const current = romanMap[char] ?? 0;
      const next = romanMap[chars[index + 1]] ?? 0;
      return total + (current < next ? -current : current);
    }, 0);
}

function intToRoman(value: number) {
  const romanPairs: Array<[number, string]> = [
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];

  let remaining = value;
  let result = '';

  for (const [amount, numeral] of romanPairs) {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  }

  return result || 'I';
}

function getNextBlockLabel(blocks: Block[]) {
    const lastLabel = blocks.length > 0 ? blocks[blocks.length - 1].label.trim() : undefined;
  if (!lastLabel) {
    return '1º';
  }

  const ordinalMatch = lastLabel.match(/^(\d+)[ºª°]$/);
  if (ordinalMatch) {
    return `${Number(ordinalMatch[1]) + 1}º`;
  }

  const namedMatch = lastLabel.match(/^(Bloco|Parte|Seção)\s+([A-Z]+)$/i);
  if (namedMatch) {
    return `${normalizePrefix(namedMatch[1])} ${nextAlpha(namedMatch[2])}`;
  }

  const numberedNamedMatch = lastLabel.match(/^(Bloco|Parte|Seção)\s+(\d+)$/i);
  if (numberedNamedMatch) {
    return `${normalizePrefix(numberedNamedMatch[1])} ${Number(numberedNamedMatch[2]) + 1}`;
  }

  const romanMatch = lastLabel.match(/^([IVXLC]+)([.)])$/i);
  if (romanMatch) {
    return `${intToRoman(romanToInt(romanMatch[1]) + 1)}${romanMatch[2]}`;
  }

  return `Bloco ${blocks.length + 1}`;
}

function updateSetlist(setlist: Setlist, updater: (current: Setlist) => Setlist) {
  const next = updater(setlist);
  return {
    ...next,
    updatedAt: nowIso(),
  };
}

interface SetlistStoreState {
  library: SetlistSummary[];
  libraryLoading: boolean;
  editorLoading: boolean;
  currentSetlist: Setlist;
  recentChordColors: string[];
  importText: string;
  importPanelOpen: boolean;
  collapsedBlockIds: string[];
  dirtyRevision: number;
  lastSavedRevision: number;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  saveFlashKey: number;
  toasts: ToastMessage[];
  loadLibrary: () => Promise<void>;
  loadSetlistById: (id: number) => Promise<void>;
  startNewSetlist: () => void;
  saveCurrentSetlist: () => Promise<number | null>;
  deleteSetlistById: (id: number) => Promise<void>;
  duplicateSetlistById: (id: number) => Promise<number | null>;
  updateTitle: (title: string) => void;
  setImportText: (value: string) => void;
  setImportPanelOpen: (open: boolean) => void;
  parseImportTextToBlocks: () => void;
  replaceBlocks: (blocks: Block[]) => void;
  updateSettings: (patch: Partial<PrintSettings>) => void;
  addBlock: () => void;
  updateBlockLabel: (blockId: string, label: string) => void;
  deleteBlock: (blockId: string) => void;
  toggleBlockCollapsed: (blockId: string) => void;
  addSong: (blockId: string) => void;
  updateSong: (blockId: string, songId: string, patch: Partial<Song>) => void;
  normalizeSongChord: (blockId: string, songId: string) => void;
  deleteSong: (blockId: string, songId: string) => void;
  addToast: (message: string, tone?: ToastMessage['tone']) => void;
  removeToast: (id: string) => void;
}

export const useSetlistStore = create<SetlistStoreState>((set, get) => ({
  library: [],
  libraryLoading: false,
  editorLoading: false,
  currentSetlist: createDefaultSetlist(),
  recentChordColors: loadRecentChordColors(),
  importText: '',
  importPanelOpen: true,
  collapsedBlockIds: [],
  dirtyRevision: 0,
  lastSavedRevision: 0,
  saveState: 'idle',
  saveFlashKey: 0,
  toasts: [],

  async loadLibrary() {
    set({ libraryLoading: true });

    try {
      const library = await getAllSetlists();
      set({ library: library.map((setlist) => normalizeSetlist(setlist)), libraryLoading: false });
    } catch (error) {
      set({ libraryLoading: false });
      const message = error instanceof Error ? error.message : 'Não foi possível carregar os repertórios.';
      get().addToast(message, 'error');
    }
  },

  async loadSetlistById(id) {
    set({ editorLoading: true, saveState: 'idle' });

    try {
      const setlist = normalizeSetlist(await getSetlist(id));
      set({
        currentSetlist: setlist,
        recentChordColors: pushRecentChordColor(get().recentChordColors, setlist.settings.chordColor),
        importText: '',
        importPanelOpen: false,
        collapsedBlockIds: [],
        dirtyRevision: 0,
        lastSavedRevision: 0,
        saveState: 'idle',
        editorLoading: false,
      });
    } catch (error) {
      set({ editorLoading: false });
      const message = error instanceof Error ? error.message : 'Não foi possível abrir o repertório.';
      get().addToast(message, 'error');
      throw error;
    }
  },

  startNewSetlist() {
    set({
      currentSetlist: createDefaultSetlist(),
      recentChordColors: pushRecentChordColor(get().recentChordColors, DEFAULT_PRINT_SETTINGS.chordColor),
      importText: '',
      importPanelOpen: true,
      collapsedBlockIds: [],
      dirtyRevision: 0,
      lastSavedRevision: 0,
      saveState: 'idle',
      editorLoading: false,
    });
  },

  async saveCurrentSetlist() {
    const state = get();
    if (state.saveState === 'saving') {
      return state.currentSetlist.id ?? null;
    }

    const draft = {
      ...normalizeSetlist(state.currentSetlist),
      updatedAt: nowIso(),
    };

    set({
      currentSetlist: draft,
      saveState: 'saving',
    });

    try {
      const id = await saveSetlist(draft);
      set((current) => ({
        currentSetlist: { ...current.currentSetlist, id },
        lastSavedRevision: current.dirtyRevision,
        saveState: 'saved',
        saveFlashKey: current.saveFlashKey + 1,
      }));
      void get().loadLibrary();
      return id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível salvar o repertório.';
      set({ saveState: 'error' });
      get().addToast(message, 'error');
      return null;
    }
  },

  async deleteSetlistById(id) {
    try {
      await deleteSetlist(id);
      set((state) => ({
        library: state.library.filter((item) => item.id !== id),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível excluir o repertório.';
      get().addToast(message, 'error');
    }
  },

  async duplicateSetlistById(id) {
    try {
      const nextId = await duplicateSetlist(id);
      await get().loadLibrary();
      get().addToast('Repertório duplicado.', 'success');
      return nextId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível duplicar o repertório.';
      get().addToast(message, 'error');
      return null;
    }
  },

  updateTitle(title) {
    set((state) => {
      if (state.currentSetlist.title === title) {
        return state;
      }

      return {
        currentSetlist: updateSetlist(state.currentSetlist, (current) => ({
          ...current,
          title,
        })),
        dirtyRevision: state.dirtyRevision + 1,
        saveState: 'idle',
      };
    });
  },

  setImportText(value) {
    set({ importText: value });
  },

  setImportPanelOpen(open) {
    set({ importPanelOpen: open });
  },

  parseImportTextToBlocks() {
    set((state) => {
      const parsedBlocks = parseRawText(state.importText);
      return {
        currentSetlist: updateSetlist(state.currentSetlist, (current) => ({
          ...current,
          blocks: parsedBlocks,
        })),
        importPanelOpen: false,
        collapsedBlockIds: [],
        dirtyRevision: state.dirtyRevision + 1,
        saveState: 'idle',
      };
    });
  },

  replaceBlocks(blocks) {
    set((state) => ({
      currentSetlist: updateSetlist(state.currentSetlist, (current) => ({
        ...current,
        blocks,
      })),
      collapsedBlockIds: state.collapsedBlockIds.filter((blockId) => blocks.some((block) => block.id === blockId)),
      dirtyRevision: state.dirtyRevision + 1,
      saveState: 'idle',
    }));
  },

  updateSettings(patch) {
    set((state) => {
      const nextSettings = normalizePrintSettings({ ...state.currentSetlist.settings, ...patch });
      const changed = (Object.keys(nextSettings) as Array<keyof PrintSettings>).some(
        (key) => nextSettings[key] !== state.currentSetlist.settings[key],
      );

      if (!changed) {
        return state;
      }

      return {
        currentSetlist: updateSetlist(state.currentSetlist, (current) => ({
          ...current,
          settings: nextSettings,
        })),
        recentChordColors: patch.chordColor
          ? pushRecentChordColor(state.recentChordColors, patch.chordColor)
          : state.recentChordColors,
        dirtyRevision: state.dirtyRevision + 1,
        saveState: 'idle',
      };
    });
  },

  addBlock() {
    set((state) => ({
      currentSetlist: updateSetlist(state.currentSetlist, (current) => ({
        ...current,
        blocks: [
          ...current.blocks,
          {
            id: nanoid(),
            label: getNextBlockLabel(current.blocks),
            songs: [],
          },
        ],
      })),
      dirtyRevision: state.dirtyRevision + 1,
      saveState: 'idle',
    }));
  },

  updateBlockLabel(blockId, label) {
    set((state) => ({
      currentSetlist: updateSetlist(state.currentSetlist, (current) => ({
        ...current,
        blocks: current.blocks.map((block) => (block.id === blockId ? { ...block, label } : block)),
      })),
      dirtyRevision: state.dirtyRevision + 1,
      saveState: 'idle',
    }));
  },

  deleteBlock(blockId) {
    set((state) => ({
      currentSetlist: updateSetlist(state.currentSetlist, (current) => ({
        ...current,
        blocks: current.blocks.filter((block) => block.id !== blockId),
      })),
      collapsedBlockIds: state.collapsedBlockIds.filter((id) => id !== blockId),
      dirtyRevision: state.dirtyRevision + 1,
      saveState: 'idle',
    }));
  },

  toggleBlockCollapsed(blockId) {
    set((state) => {
      const isCollapsed = state.collapsedBlockIds.includes(blockId);
      return {
        collapsedBlockIds: isCollapsed
          ? state.collapsedBlockIds.filter((id) => id !== blockId)
          : [...state.collapsedBlockIds, blockId],
      };
    });
  },

  addSong(blockId) {
    set((state) => ({
      currentSetlist: updateSetlist(state.currentSetlist, (current) => ({
        ...current,
        blocks: current.blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                songs: [
                  ...block.songs,
                  {
                    id: nanoid(),
                    name: '',
                    chord: '',
                  },
                ],
              }
            : block,
        ),
      })),
      dirtyRevision: state.dirtyRevision + 1,
      saveState: 'idle',
    }));
  },

  updateSong(blockId, songId, patch) {
    set((state) => ({
      currentSetlist: updateSetlist(state.currentSetlist, (current) => ({
        ...current,
        blocks: current.blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                songs: block.songs.map((song) =>
                  song.id === songId
                    ? {
                        ...song,
                        ...patch,
                      }
                    : song,
                ),
              }
            : block,
        ),
      })),
      dirtyRevision: state.dirtyRevision + 1,
      saveState: 'idle',
    }));
  },

  normalizeSongChord(blockId, songId) {
    set((state) => ({
      currentSetlist: updateSetlist(state.currentSetlist, (current) => ({
        ...current,
        blocks: current.blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                songs: block.songs.map((song) =>
                  song.id === songId
                    ? {
                        ...song,
                        chord: normalizeChord(song.chord),
                      }
                    : song,
                ),
              }
            : block,
        ),
      })),
      dirtyRevision: state.dirtyRevision + 1,
      saveState: 'idle',
    }));
  },

  deleteSong(blockId, songId) {
    set((state) => ({
      currentSetlist: updateSetlist(state.currentSetlist, (current) => ({
        ...current,
        blocks: current.blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                songs: block.songs.filter((song) => song.id !== songId),
              }
            : block,
        ),
      })),
      dirtyRevision: state.dirtyRevision + 1,
      saveState: 'idle',
    }));
  },

  addToast(message, tone = 'info') {
    const id = nanoid();
    set((state) => ({
      toasts: [...state.toasts, { id, message, tone }],
    }));

    window.setTimeout(() => {
      get().removeToast(id);
    }, 3000);
  },

  removeToast(id) {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
}));
