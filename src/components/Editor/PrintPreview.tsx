import { createPortal } from 'react-dom';
import type { Block, PrintSettings, Setlist } from '../../types';
import { truncateSongName } from '../../types';
import styles from './PrintPreview.module.css';

interface PrintPreviewProps {
  setlist: Setlist;
}

interface PreviewPage {
  columns: Block[][];
}

const PAGE_HEIGHT_PX = 1123;
const PAGE_MARGIN_PX = 57;
const COLUMN_GAP_PX = 30;
const TITLE_GAP_PX = 36;
const BLOCK_GAP_PX = 12;

function estimateLineHeight(settings: PrintSettings) {
  return settings.songSize * settings.lineSpacing;
}

function estimateColumnHeight(settings: PrintSettings) {
  const titleBand = settings.titleSize * 1.15 + TITLE_GAP_PX;
  return PAGE_HEIGHT_PX - PAGE_MARGIN_PX * 2 - titleBand;
}

function estimateBlockHeight(block: Block, settings: PrintSettings) {
  return settings.blockSize + block.songs.length * estimateLineHeight(settings) + BLOCK_GAP_PX;
}

function buildPreviewPages(setlist: Setlist): PreviewPage[] {
  const columnCount = setlist.settings.columns;
  const maxColumnHeight = estimateColumnHeight(setlist.settings);
  const pages: PreviewPage[] = [];

  let pageColumns = Array.from({ length: columnCount }, () => [] as Block[]);
  let currentColumnIndex = 0;
  let currentColumnHeight = 0;

  for (const block of setlist.blocks) {
    const blockHeight = estimateBlockHeight(block, setlist.settings);

    if (currentColumnHeight > 0 && currentColumnHeight + blockHeight > maxColumnHeight) {
      currentColumnIndex += 1;
      currentColumnHeight = 0;

      if (currentColumnIndex >= columnCount) {
        pages.push({ columns: pageColumns });
        pageColumns = Array.from({ length: columnCount }, () => [] as Block[]);
        currentColumnIndex = 0;
      }
    }

    pageColumns[currentColumnIndex].push(block);
    currentColumnHeight += blockHeight;
  }

  pages.push({ columns: pageColumns });
  return pages;
}

function SheetPage({
  setlist,
  page,
}: {
  setlist: Setlist;
  page: PreviewPage;
}) {
  const { settings } = setlist;

  return (
    <div
      className={`${styles.sheet} a4-sheet`}
      style={{
        fontFamily: settings.font,
      }}
    >
      <h1
        className={styles.sheetTitle}
        style={{
          fontSize: `${settings.titleSize}px`,
        }}
      >
        {setlist.title || 'Novo repert\u00F3rio'}
      </h1>

      <div
        className={styles.columns}
        style={{
          gridTemplateColumns: `repeat(${settings.columns}, minmax(0, 1fr))`,
          gap: `${COLUMN_GAP_PX}px`,
        }}
      >
        {page.columns.map((column, columnIndex) => (
          <div key={`column-${columnIndex}`} className={styles.column}>
            {column.map((block) => (
              <section key={block.id} className={styles.block}>
                <h2
                  className={styles.blockLabel}
                  style={{
                    fontSize: `${settings.blockSize}px`,
                  }}
                >
                  {block.label}
                </h2>

                <div
                  className={styles.songList}
                  style={{
                    lineHeight: settings.lineSpacing,
                  }}
                >
                  {block.songs.map((song) => {
                    const name = truncateSongName(song.name, settings.truncateAt);
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
                        <span className={`${styles.songName} ${inlineChord ? styles.songNameInline : ''}`}>
                          {name || 'M\u00FAsica sem t\u00EDtulo'}
                        </span>
                        <span className={`${styles.songRight} ${inlineChord ? styles.songRightInline : ''}`}>
                          {hasChord ? <span className={styles.songDash}>{'\u2013'}</span> : null}
                          {hasChord ? (
                            <span className={`${styles.songChord} song-chord`} style={{ color: settings.chordColor }}>
                              {song.chord}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PrintPreview({ setlist }: PrintPreviewProps) {
  const printRoot = typeof document !== 'undefined' ? document.getElementById('print-root') : null;
  const pages = buildPreviewPages(setlist);

  return (
    <>
      <div className={styles.previewArea}>
        {pages.map((page, index) => (
          <div key={`preview-page-${index}`} className={`${styles.sheetWrapper} sheet-shadow-wrapper`}>
            <SheetPage setlist={setlist} page={page} />
          </div>
        ))}
      </div>

      {printRoot
        ? createPortal(
            <div className={styles.printMount}>
              {pages.map((page, index) => (
                <SheetPage key={`print-page-${index}`} setlist={setlist} page={page} />
              ))}
            </div>,
            printRoot,
          )
        : null}
    </>
  );
}
