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
      <span className="rail-divider" />
      <span>
        <Icon name="file-x" />
        NO WRITES
      </span>
      <span className="rail-divider" />
      <span className="rail-dry">
        <Icon name="flask-conical" />
        DRY RUN
      </span>
      <span className="rail-divider" />
      <span>
        approval: <b>MANUAL</b>
      </span>
      <span className="rail-spacer" />
      <span className="rail-command">latest: {lastCommand}</span>
    </>
  );
}
