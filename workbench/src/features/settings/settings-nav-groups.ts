/** Intent-based settings navigation groups (display order). */
export const SETTINGS_NAV_GROUPS: ReadonlyArray<{ label: string; sectionIds: readonly string[] }> = [
  { label: "App", sectionIds: ["general", "workspace"] },
  { label: "Local model", sectionIds: ["provider"] },
  { label: "System", sectionIds: ["updates", "doctor"] },
  { label: "Boundaries", sectionIds: ["permissions", "research"] },
  { label: "Advanced", sectionIds: ["staff", "scheduler", "benchmarks", "creative", "engine"] }
] as const;
