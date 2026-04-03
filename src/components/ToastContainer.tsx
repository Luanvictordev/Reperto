import { useSetlistStore } from '../store/useSetlistStore';
import styles from './ToastContainer.module.css';

export default function ToastContainer() {
  const toasts = useSetlistStore((state) => state.toasts);

  return (
    <div className={styles.container} aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${styles.toast} ${styles[toast.tone]}`}
          role="status"
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
