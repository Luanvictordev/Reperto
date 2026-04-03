import styles from './ImportPanel.module.css';

interface ImportPanelProps {
  value: string;
  open: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  onParse: () => void;
}

export default function ImportPanel({
  value,
  open,
  onToggle,
  onChange,
  onParse,
}: ImportPanelProps) {
  return (
    <section className={styles.wrapper}>
      <div className={styles.buttonWrap}>
        <button type="button" className={styles.reimportButton} onClick={onToggle}>
          {'\u21A9 Reimportar texto'}
        </button>
      </div>

      {open ? (
        <div className={styles.panel}>
          <div className={styles.header}>
            <div>
              <h2 className={styles.title}>Importar Texto</h2>
              <p className={styles.subtitle}>
                {'Cole o repert\u00F3rio bruto e deixe o parser separar blocos e m\u00FAsicas.'}
              </p>
            </div>
          </div>

          <textarea
            value={value}
            className={styles.textarea}
            placeholder={`1\u00BA\nM\u00FAsica de Abertura - Em\nOutra M\u00FAsica - D\n\n2\u00BA\nCan\u00E7\u00E3o Final`}
            onChange={(event) => onChange(event.target.value)}
          />

          <div className={styles.footer}>
            <button type="button" className={styles.parseButton} onClick={onParse}>
              {'Parsear M\u00FAsicas'}
            </button>
            <p className={styles.hint}>
              {'Cada linha com m\u00FAsica - Tom. Linhas como "1\u00BA" ou "Bloco A" viram separadores.'}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
