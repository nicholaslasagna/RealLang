/**
 * Bridge catalog metadata for the UI. Execution stays in Node (dev) or Tauri (future).
 * UI passes source IDs only — never shell command strings.
 */
export { cliReportSources as getCliSources } from "../data/workbench-data";
