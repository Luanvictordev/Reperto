import { useSetlistStore } from '../../store/useSetlistStore';
import type { PrintSettings, PrintFont } from '../../types';
import { CHORD_COLOR_PRESETS, PRINT_FONTS } from '../../types';
import styles from './TypographyPanel.module.css';

interface TypographyPanelProps {
  settings: PrintSettings;
  onUpdate: (patch: Partial<PrintSettings>) => void;
}

const truncateOptions: Array<{ label: string; value: number }> = [
  { label: 'N\u00E3o abreviar', value: 0 },
  { label: '28 chars', value: 28 },
  { label: '22 chars', value: 22 },
  { label: '18 chars', value: 18 },
];

export default function TypographyPanel({ settings, onUpdate }: TypographyPanelProps) {
  const recentChordColors = useSetlistStore((state) => state.recentChordColors);

  function applyChordColor(color: string) {
    onUpdate({ chordColor: color });
  }

  return (
    <div className={`${styles.grid} typography-panel`}>
      <label className={styles.field}>
        <span>Fonte</span>
        <select
          value={settings.font}
          className={styles.select}
          onChange={(event) => onUpdate({ font: event.target.value as PrintFont })}
        >
          {PRINT_FONTS.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>{`T\u00EDtulo: ${settings.titleSize}px`}</span>
        <input
          type="range"
          min={16}
          max={42}
          value={settings.titleSize}
          onChange={(event) => onUpdate({ titleSize: Number(event.target.value) })}
        />
      </label>

      <label className={styles.field}>
        <span>Bloco: {settings.blockSize}px</span>
        <input
          type="range"
          min={11}
          max={20}
          value={settings.blockSize}
          onChange={(event) => onUpdate({ blockSize: Number(event.target.value) })}
        />
      </label>

      <label className={styles.field}>
        <span>{`M\u00FAsicas: ${settings.songSize}px`}</span>
        <input
          type="range"
          min={10}
          max={20}
          value={settings.songSize}
          onChange={(event) => onUpdate({ songSize: Number(event.target.value) })}
        />
      </label>

      <label className={styles.field}>
        <span>{`Espa\u00E7amento: ${settings.lineSpacing.toFixed(1)}\u00D7`}</span>
        <input
          type="range"
          min={1}
          max={2.5}
          step={0.1}
          value={settings.lineSpacing}
          onChange={(event) => onUpdate({ lineSpacing: Number(event.target.value) })}
        />
      </label>

      <div className={styles.field}>
        <span>Colunas</span>
        <div className={styles.segmented}>
          {[1, 2, 3].map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.segment} ${settings.columns === value ? styles.segmentActive : ''}`}
              onClick={() => onUpdate({ columns: value as PrintSettings['columns'] })}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <span>{'Abrevia\u00E7\u00E3o'}</span>
        <div className={styles.segmented}>
          {truncateOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${styles.segment} ${settings.truncateAt === option.value ? styles.segmentActive : ''}`}
              onClick={() => onUpdate({ truncateAt: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <span>{'Posi\u00E7\u00E3o da cifra'}</span>
        <div className={styles.segmented}>
          <button
            type="button"
            className={`${styles.segment} ${!settings.chordInline ? styles.segmentActive : ''}`}
            onClick={() => onUpdate({ chordInline: false })}
          >
            Fim da linha
          </button>
          <button
            type="button"
            className={`${styles.segment} ${settings.chordInline ? styles.segmentActive : ''}`}
            onClick={() => onUpdate({ chordInline: true })}
          >
            Ao lado do nome
          </button>
        </div>
      </div>

      <label className={styles.field}>
        <span>Cor do tom</span>
        <input
          type="color"
          value={settings.chordColor}
          className={styles.colorInput}
          onChange={(event) => applyChordColor(event.target.value)}
        />
      </label>

      <div className={`${styles.field} ${styles.fullWidth}`}>
        <span>Presets</span>
        <div className={styles.colorSwatches}>
          {CHORD_COLOR_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              className={`${styles.colorSwatch} ${settings.chordColor === color ? styles.colorSwatchActive : ''}`}
              style={{ backgroundColor: color }}
              onClick={() => applyChordColor(color)}
              aria-label={`Usar cor ${color}`}
              title={color}
            />
          ))}
        </div>
      </div>

      <div className={`${styles.field} ${styles.fullWidth}`}>
        <span>{'\u00DAltimas usadas'}</span>
        <div className={styles.colorSwatches}>
          {recentChordColors.map((color) => (
            <button
              key={color}
              type="button"
              className={`${styles.colorSwatch} ${settings.chordColor === color ? styles.colorSwatchActive : ''}`}
              style={{ backgroundColor: color }}
              onClick={() => applyChordColor(color)}
              aria-label={`Reutilizar cor ${color}`}
              title={color}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
