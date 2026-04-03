import type { Block, BlockLayout, PrintSettings, Setlist } from '../types';

interface BalancedPage {
  columns: Block[][];
}

export interface PositionedBlock {
  block: Block;
  placement: BlockLayout;
}

export interface PreviewPage {
  columns: PositionedBlock[][];
}

const PAGE_HEIGHT_PX = 1123;
const PAGE_MARGIN_PX = 57;
const TITLE_GAP_PX = 36;
const BLOCK_GAP_PX = 12;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function estimateLineHeight(settings: PrintSettings) {
  return settings.songSize * settings.lineSpacing;
}

export function estimateColumnHeight(settings: PrintSettings) {
  const titleBand = settings.titleSize * 1.15 + TITLE_GAP_PX;
  return PAGE_HEIGHT_PX - PAGE_MARGIN_PX * 2 - titleBand;
}

export function estimateBlockHeight(block: Block, settings: PrintSettings) {
  return settings.blockSize * 1.2 + block.songs.length * estimateLineHeight(settings) + BLOCK_GAP_PX;
}

function canFitInColumns(heights: number[], columns: number, maxHeight: number) {
  const memo = new Map<string, boolean>();

  function visit(index: number, columnsLeft: number) {
    const key = `${index}:${columnsLeft}`;
    if (memo.has(key)) {
      return memo.get(key) ?? false;
    }

    if (index === heights.length) {
      return true;
    }

    if (columnsLeft === 0) {
      return false;
    }

    let runningHeight = 0;
    for (let end = index; end < heights.length; end += 1) {
      runningHeight += heights[end];
      if (runningHeight > maxHeight) {
        break;
      }

      if (visit(end + 1, columnsLeft - 1)) {
        memo.set(key, true);
        return true;
      }
    }

    memo.set(key, false);
    return false;
  }

  return visit(0, columns);
}

function splitBlocksBalanced(blocks: Block[], settings: PrintSettings) {
  const columns = settings.columns;
  const heights = blocks.map((block) => estimateBlockHeight(block, settings));
  const targetHeight = heights.reduce((total, height) => total + height, 0) / columns;
  const activeGroups = Math.min(columns, Math.max(blocks.length, 1));
  const memo = new Map<string, { cost: number; cuts: number[] }>();

  function visit(index: number, groupsLeft: number): { cost: number; cuts: number[] } {
    const key = `${index}:${groupsLeft}`;
    if (memo.has(key)) {
      return memo.get(key)!;
    }

    if (groupsLeft === 1) {
      const sliceHeight = heights.slice(index).reduce((total, height) => total + height, 0);
      const result = {
        cost: (sliceHeight - targetHeight) ** 2,
        cuts: [blocks.length],
      };
      memo.set(key, result);
      return result;
    }

    let best = { cost: Number.POSITIVE_INFINITY, cuts: [blocks.length] };
    let runningHeight = 0;
    const maxEnd = blocks.length - groupsLeft + 1;

    for (let end = index + 1; end <= maxEnd; end += 1) {
      runningHeight += heights[end - 1];
      const next = visit(end, groupsLeft - 1);
      const cost = (runningHeight - targetHeight) ** 2 + next.cost;

      if (cost < best.cost) {
        best = {
          cost,
          cuts: [end, ...next.cuts],
        };
      }
    }

    memo.set(key, best);
    return best;
  }

  const cuts = blocks.length === 0 ? [] : visit(0, activeGroups).cuts;
  const output: Block[][] = [];
  let start = 0;

  for (const end of cuts) {
    output.push(blocks.slice(start, end));
    start = end;
  }

  while (output.length < columns) {
    output.push([]);
  }

  return output;
}

function buildBalancedPages(blocks: Block[], settings: PrintSettings): BalancedPage[] {
  const pages: BalancedPage[] = [];
  const columnCount = settings.columns;
  const maxColumnHeight = estimateColumnHeight(settings);
  let cursor = 0;

  while (cursor < blocks.length) {
    let pageCount = 1;

    while (cursor + pageCount <= blocks.length) {
      const heights = blocks.slice(cursor, cursor + pageCount).map((block) => estimateBlockHeight(block, settings));
      if (!canFitInColumns(heights, columnCount, maxColumnHeight)) {
        break;
      }
      pageCount += 1;
    }

    const safeCount = Math.max(1, pageCount - 1);
    const pageBlocks = blocks.slice(cursor, cursor + safeCount);
    pages.push({
      columns: splitBlocksBalanced(pageBlocks, settings),
    });
    cursor += safeCount;
  }

  if (pages.length === 0) {
    pages.push({
      columns: Array.from({ length: columnCount }, () => [] as Block[]),
    });
  }

  return pages;
}

function createEmptyPage(columns: number) {
  return {
    columns: Array.from({ length: columns }, () => [] as PositionedBlock[]),
    heights: Array.from({ length: columns }, () => 0),
  };
}

function getClampedPlacement(block: Block, columns: number): BlockLayout {
  return {
    page: Math.max(0, Math.trunc(block.layout?.page ?? 0)),
    column: clamp(Math.trunc(block.layout?.column ?? 0), 0, columns - 1),
  };
}

export function assignBalancedBlockLayout(blocks: Block[], settings: PrintSettings): Block[] {
  const layoutById = new Map<string, BlockLayout>();
  const pages = buildBalancedPages(blocks, settings);

  pages.forEach((page, pageIndex) => {
    page.columns.forEach((column, columnIndex) => {
      column.forEach((block) => {
        layoutById.set(block.id, { page: pageIndex, column: columnIndex });
      });
    });
  });

  return blocks.map((block) => ({
    ...block,
    layout: layoutById.get(block.id) ?? { page: 0, column: 0 },
  }));
}

export function hasBlockLayout(block: Block) {
  return (
    typeof block.layout?.page === 'number' &&
    Number.isFinite(block.layout.page) &&
    block.layout.page >= 0 &&
    typeof block.layout?.column === 'number' &&
    Number.isFinite(block.layout.column) &&
    block.layout.column >= 0
  );
}

export function buildPreviewPages(setlist: Pick<Setlist, 'blocks' | 'settings'>): PreviewPage[] {
  const columnCount = setlist.settings.columns;
  const maxColumnHeight = estimateColumnHeight(setlist.settings);
  const pages: Array<ReturnType<typeof createEmptyPage>> = [];

  function ensurePage(pageIndex: number) {
    while (pages.length <= pageIndex) {
      pages.push(createEmptyPage(columnCount));
    }

    return pages[pageIndex];
  }

  setlist.blocks.forEach((block) => {
    const blockHeight = estimateBlockHeight(block, setlist.settings);
    const preferred = getClampedPlacement(block, columnCount);
    let pageIndex = preferred.page;

    while (true) {
      const page = ensurePage(pageIndex);
      const nextHeight = page.heights[preferred.column] + blockHeight;
      const canPlace = nextHeight <= maxColumnHeight || page.columns[preferred.column].length === 0;

      if (canPlace) {
        page.columns[preferred.column].push({
          block,
          placement: {
            page: pageIndex,
            column: preferred.column,
          },
        });
        page.heights[preferred.column] = nextHeight;
        return;
      }

      pageIndex += 1;
    }
  });

  if (pages.length === 0) {
    pages.push(createEmptyPage(columnCount));
  }

  return pages.map((page) => ({ columns: page.columns }));
}

export function suggestPlacementForNewBlock(blocks: Block[], nextBlock: Block, settings: PrintSettings): BlockLayout {
  if (blocks.length === 0) {
    return { page: 0, column: 0 };
  }

  const pages = buildPreviewPages({ blocks, settings });
  const lastPageIndex = pages.length - 1;
  const lastPage = pages[lastPageIndex];
  const blockHeight = estimateBlockHeight(nextBlock, settings);
  const maxColumnHeight = estimateColumnHeight(settings);
  const columnHeights = lastPage.columns.map((column) =>
    column.reduce((total, item) => total + estimateBlockHeight(item.block, settings), 0),
  );

  const fittingColumn = columnHeights
    .map((height, column) => ({ height, column }))
    .filter((entry) => entry.height + blockHeight <= maxColumnHeight)
    .sort((left, right) => left.height - right.height)[0];

  if (fittingColumn) {
    return { page: lastPageIndex, column: fittingColumn.column };
  }

  return { page: lastPageIndex + 1, column: 0 };
}
