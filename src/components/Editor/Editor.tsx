import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { confirm } from '@tauri-apps/plugin-dialog';
import { exportPdf, printSetlist } from '../../lib/db';
import { countSongs } from '../../types';
import { useSetlistStore } from '../../store/useSetlistStore';
import ImportPanel from './ImportPanel';
import PrintPreview from './PrintPreview';
import Toolbar from './Toolbar';
import TypographyPanel from './TypographyPanel';
import VisualEditor from './VisualEditor';
import CollapsibleSection from './CollapsibleSection';
import styles from './Editor.module.css';

export default function Editor() {
  const navigate = useNavigate();
  const { id } = useParams();
  const currentSetlist = useSetlistStore((state) => state.currentSetlist);
  const editorLoading = useSetlistStore((state) => state.editorLoading);
  const importPanelOpen = useSetlistStore((state) => state.importPanelOpen);
  const importText = useSetlistStore((state) => state.importText);
  const dirtyRevision = useSetlistStore((state) => state.dirtyRevision);
  const lastSavedRevision = useSetlistStore((state) => state.lastSavedRevision);
  const saveState = useSetlistStore((state) => state.saveState);
  const saveFlashKey = useSetlistStore((state) => state.saveFlashKey);
  const loadSetlistById = useSetlistStore((state) => state.loadSetlistById);
  const startNewSetlist = useSetlistStore((state) => state.startNewSetlist);
  const saveCurrentSetlist = useSetlistStore((state) => state.saveCurrentSetlist);
  const parseImportTextToBlocks = useSetlistStore((state) => state.parseImportTextToBlocks);
  const setImportText = useSetlistStore((state) => state.setImportText);
  const setImportPanelOpen = useSetlistStore((state) => state.setImportPanelOpen);
  const updateSettings = useSetlistStore((state) => state.updateSettings);
  const addToast = useSetlistStore((state) => state.addToast);

  const isNewSetlist = !id;
  const hasSongs = countSongs(currentSetlist.blocks) > 0;
  const hasUnsavedChanges = dirtyRevision !== lastSavedRevision;

  useEffect(() => {
    if (!id) {
      startNewSetlist();
      return;
    }

    const numericId = Number(id);
    if (!Number.isFinite(numericId)) {
      navigate('/', { replace: true });
      return;
    }

    void loadSetlistById(numericId).catch(() => {
      navigate('/', { replace: true });
    });
  }, [id, loadSetlistById, navigate, startNewSetlist]);

  async function handleSave() {
    const savedId = await saveCurrentSetlist();
    if (isNewSetlist && savedId) {
      navigate(`/editor/${savedId}`, { replace: true });
    }
    return savedId;
  }

  useEffect(() => {
    if (editorLoading || !hasUnsavedChanges) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void handleSave();
    }, 1500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [dirtyRevision, editorLoading, hasUnsavedChanges]);

  useEffect(() => {
    function handleShortcuts(event: KeyboardEvent) {
      const metaPressed = event.ctrlKey || event.metaKey;
      if (!metaPressed) {
        return;
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSave();
      }

      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        void handlePrint();
      }
    }

    window.addEventListener('keydown', handleShortcuts);
    return () => {
      window.removeEventListener('keydown', handleShortcuts);
    };
  }, [currentSetlist, isNewSetlist]);

  async function handleBack() {
    await handleSave();
    navigate('/');
  }

  async function handleExportPdf() {
    const savedId = await handleSave();
    const setlist = useSetlistStore.getState().currentSetlist;

    try {
      const path = await exportPdf(setlist);
      addToast(`PDF exportado em ${path}`, 'success');
      if (isNewSetlist && savedId) {
        navigate(`/editor/${savedId}`, { replace: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao exportar o PDF.';
      if (/cancel/i.test(message)) {
        return;
      }
      addToast(`Erro ao exportar PDF: ${message}`, 'error');
    }
  }

  async function handlePrint() {
    const savedId = await handleSave();
    const setlist = useSetlistStore.getState().currentSetlist;

    try {
      const path = await printSetlist(setlist);
      addToast(`PDF de impressão aberto em ${path}`, 'success');
      if (isNewSetlist && savedId) {
        navigate(`/editor/${savedId}`, { replace: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao preparar impressão.';
      addToast(`Erro ao imprimir: ${message}`, 'error');
    }
  }

  async function handleParseImport() {
    if (hasSongs) {
      const approved = await confirm('Importar o texto irá substituir os blocos atuais. Deseja continuar?', {
        title: 'Reimportar texto',
        kind: 'warning',
      });

      if (!approved) {
        return;
      }
    }

    parseImportTextToBlocks();
  }

  if (editorLoading) {
    return <main className={styles.loading}>Carregando repertório...</main>;
  }

  return (
    <main className={styles.page}>
      <Toolbar
        saveState={saveState}
        saveFlashKey={saveFlashKey}
        onBack={() => void handleBack()}
        onSave={() => void handleSave()}
        onPrint={() => void handlePrint()}
        onExportPdf={() => void handleExportPdf()}
      />

      <section className={styles.content}>
        <aside className={`${styles.leftPanel} left-panel`}>
          <ImportPanel
            value={importText}
            open={importPanelOpen}
            onToggle={() => setImportPanelOpen(!importPanelOpen)}
            onChange={setImportText}
            onParse={() => void handleParseImport()}
          />

          <div className={styles.sections}>
            <CollapsibleSection title="Editor Visual" defaultOpen>
              <VisualEditor />
            </CollapsibleSection>

            <CollapsibleSection title="Tipografia" defaultOpen={false}>
              <TypographyPanel settings={currentSetlist.settings} onUpdate={updateSettings} />
            </CollapsibleSection>
          </div>
        </aside>

        <section className={styles.rightPanel}>
          <PrintPreview setlist={currentSetlist} />
        </section>
      </section>
    </main>
  );
}
