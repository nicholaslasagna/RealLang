import { useWorkbenchStore } from "../../state/workbench-store";
import { Icon } from "../primitives";

export function StatusRail() {
  const operationStatus = useWorkbenchStore((s) => s.operationStatus);
  const lastCommand = useWorkbenchStore((s) => s.lastCommand);

  return (
    <>
      <span className="rail-state">
        <span className="live-dot" />
        {operationStatus}
      </span>
      <span className="rail-safety-compact" title="No writes · dry run · manual approval">
        <Icon name="shield-check" />
        Safe mode
      </span>
      <details className="rail-details">
        <summary className="rail-details__summary">Details</summary>
        <span className="rail-detail-item">
          <Icon name="file-x" />
          NO WRITES
        </span>
        <span className="rail-detail-item rail-dry">
          <Icon name="flask-conical" />
          DRY RUN
        </span>
        <span className="rail-detail-item">
          approval: <b>MANUAL</b>
        </span>
        <span className="rail-detail-item">latest: {lastCommand}</span>
      </details>
      <span className="rail-spacer" />
    </>
  );
}
