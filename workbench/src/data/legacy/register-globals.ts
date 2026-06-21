import { cliReportSources } from "../cli/cli-report-sources";
import { fixtureBundle } from "../fixtures";
import { reportImport } from "../import/report-import";
import { dataStatus } from "../status/status";
import { reportAdapters } from "../adapters/report-adapters";
import { viewModels } from "../view-models/workbench-view-models";

const g = globalThis as Record<string, unknown>;

g.RealForgeDataStatus = dataStatus;
g.RealForgeReportAdapters = reportAdapters;
g.RealForgeReportImport = reportImport;
g.RealForgeCliSources = cliReportSources;
g.RealForgeViewModels = viewModels;
g.RealForgeFixtureData = fixtureBundle;
