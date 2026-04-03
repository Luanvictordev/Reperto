import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { confirm } from '@tauri-apps/plugin-dialog';
import SetlistCard from '../SetlistCard';
import styles from './Library.module.css';
import { useSetlistStore } from '../../store/useSetlistStore';

export default function Library() {
  const navigate = useNavigate();
  const library = useSetlistStore((state) => state.library);
  const libraryLoading = useSetlistStore((state) => state.libraryLoading);
  const loadLibrary = useSetlistStore((state) => state.loadLibrary);
  const startNewSetlist = useSetlistStore((state) => state.startNewSetlist);
  const deleteSetlistById = useSetlistStore((state) => state.deleteSetlistById);
  const duplicateSetlistById = useSetlistStore((state) => state.duplicateSetlistById);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  async function handleDelete(id: number) {
    const approved = await confirm('Deseja excluir este repertório?', {
      title: 'Excluir repertório',
      kind: 'warning',
    });

    if (!approved) {
      return;
    }

    await deleteSetlistById(id);
  }

  async function handleDuplicate(id: number) {
    await duplicateSetlistById(id);
  }

  function handleCreate() {
    startNewSetlist();
    navigate('/editor/new');
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Reperto</h1>
        </div>

        <button type="button" className={styles.createButton} onClick={handleCreate}>
          + Novo Repertório
        </button>
      </header>

      {libraryLoading ? (
        <div className={styles.centeredState}>Carregando repertórios...</div>
      ) : library.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyEyebrow}>Nenhum repertório salvo</span>
          <h2>Crie seu primeiro repertório</h2>
          <p>Monte blocos, ajuste a tipografia e imprima em A4 em poucos minutos.</p>
          <button type="button" className={styles.emptyButton} onClick={handleCreate}>
            Crie seu primeiro repertório
          </button>
        </div>
      ) : (
        <section className={styles.grid}>
          {library.map((setlist) => (
            <SetlistCard
              key={setlist.id}
              setlist={setlist}
              onOpen={() => navigate(`/editor/${setlist.id}`)}
              onDuplicate={() => void handleDuplicate(setlist.id)}
              onDelete={() => void handleDelete(setlist.id)}
            />
          ))}
        </section>
      )}
    </main>
  );
}
