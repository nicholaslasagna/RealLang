import { useWorkbenchStore } from "../../state/workbench-store";

export function ToastRegion() {
  const toast = useWorkbenchStore((s) => s.toast);
  if (!toast) return <div id="toast-region" className="toast-region" role="status" aria-live="polite" />;

  return (
    <div id="toast-region" className="toast-region is-visible" role="status" aria-live="polite">
      <div className={`toast toast--${toast.tone}`}>
        <span className="live-dot" />
        <span>{toast.message}</span>
      </div>
    </div>
  );
}
