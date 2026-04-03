import { useEffect, useRef, useState } from 'react';
import { useSetlistStore } from '../../store/useSetlistStore';
import styles from './Toolbar.module.css';

interface ToolbarProps {
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  saveFlashKey: number;
  onBack: () => void;
  onSave: () => void;
  onPrint: () => void;
  onExportPdf: () => void;
}

export default function Toolbar({
  saveState,
  saveFlashKey,
  onBack,
  onSave,
  onPrint,
  onExportPdf,
}: ToolbarProps) {
  const title = useSetlistStore((state) => state.currentSetlist.title);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [initialTitle, setInitialTitle] = useState(title);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (saveState !== 'saved') {
      return undefined;
    }

    setShowSaved(true);
    const timeoutId = window.setTimeout(() => {
      setShowSaved(false);
    }, 1600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [saveFlashKey, saveState]);

  function commitTitle() {
    setEditing(false);
  }

  function cancelEditing() {
    useSetlistStore.getState().updateTitle(initialTitle);
    setEditing(false);
  }

  return (
    <header className={`${styles.toolbar} toolbar`}>
      <div className={styles.left}>
        <button type="button" className={styles.backButton} onClick={onBack} aria-label="Voltar">
          ←
        </button>

        <div className={styles.titleWrap}>
          {editing ? (
            <input
              ref={inputRef}
              value={title}
              className={styles.titleInput}
              onChange={(event) => {
                const nextTitle = event.target.value;
                useSetlistStore.getState().updateTitle(nextTitle);
              }}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitTitle();
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelEditing();
                }
              }}
            />
          ) : (
            <h1
              className={styles.title}
              onClick={() => {
                setInitialTitle(title);
                setEditing(true);
              }}
            >
              {title || 'Novo repertório'}
            </h1>
          )}
          <span
            className={`${styles.saveIndicator} ${
              saveState === 'saving' || showSaved ? styles.saveIndicatorVisible : ''
            }`}
          >
            {saveState === 'saving' ? 'Salvando...' : 'Salvo'}
          </span>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.secondaryButton} onClick={onSave}>
          Salvar
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onPrint}>
          Imprimir
        </button>
        <button type="button" className={styles.primaryButton} onClick={onExportPdf}>
          Exportar PDF
        </button>
      </div>
    </header>
  );
}
