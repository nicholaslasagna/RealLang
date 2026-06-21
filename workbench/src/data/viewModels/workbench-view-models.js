(function registerWorkbenchViewModels(global) {
  "use strict";

  const adapters = global.RealForgeReportAdapters;
  if (!adapters) throw new Error("RealForgeReportAdapters must load before Workbench view models");

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function collectWarnings(results) {
    return results.flatMap(([source, adapterResult]) => adapterResult.warnings.map((item) => ({ source, ...item })));
  }

  function createFixtureViewModels(fixtures, options = {}) {
    const source = fixtures && typeof fixtures === "object" ? fixtures : {};
    const capabilityResult = adapters.adaptCapabilityRegistry(source.capabilities);
    const commandResult = adapters.adaptSlashCommandRegistry(source.slashCommands);
    const settingsResult = adapters.adaptSettingsSummary(source.settings);
    const doctorResult = adapters.adaptDoctorSummary(source.doctorStatus);
    const skillResult = adapters.adaptSkillBenchmarkReport(source.skillBenchmark);
    const updateResult = adapters.adaptUpdateBundle(source.updateBundle, { staffMode: options.staffMode === true });
    const studioSource = source.studioReports && typeof source.studioReports === "object" ? source.studioReports : {};
    const studioResults = {
      creative: adapters.adaptCreativeBrief(studioSource.creative?.report),
      image: adapters.adaptImageJob(studioSource.image?.report),
      vision: adapters.adaptVisionReport(studioSource.vision?.report),
      engine: adapters.adaptEngineProjectProfile(studioSource.engine?.report),
      assets: adapters.adaptAssetPipelinePlan(studioSource.assets?.report)
    };

    const settingsSections = settingsResult.data.sections.map((section) => ({ id: section.id, label: section.label, icon: section.icon }));
    const settings = Object.fromEntries(settingsResult.data.sections.map((section) => [section.id, section.values.map((entry) => [entry.label, entry.value, entry.note])]));
    const studio = Object.fromEntries(Object.entries(studioSource).map(([domain, entry]) => [domain, entry.presentation]));

    const results = [
      ["capabilities", capabilityResult],
      ["slashCommands", commandResult],
      ["settings", settingsResult],
      ["doctorStatus", doctorResult],
      ["skillBenchmark", skillResult],
      ["updateBundle", updateResult],
      ...Object.entries(studioResults).map(([domain, adapterResult]) => [`studio.${domain}`, adapterResult])
    ];

    return deepFreeze({
      capabilities: capabilityResult.data.capabilities.map((capability) => ({
        domain: capability.domain,
        icon: capability.icon,
        status: capability.status,
        safety: capability.safety,
        writes: capability.writes,
        staff: capability.staffRequired,
        network: capability.networkRequired,
        description: capability.description,
        next: capability.suggestedCommand
      })),
      commands: commandResult.data.commands.map((command) => ({
        command: command.command,
        domain: command.domain,
        description: command.description,
        safety: command.safety,
        writes: command.writes,
        staff: command.staffOnly,
        network: command.networkRequired
      })),
      settingsSections,
      settings,
      doctor: doctorResult.data,
      benchmarks: {
        overall: skillResult.data.overall.toFixed(2),
        gate: skillResult.data.gate.toFixed(2),
        tasks: String(skillResult.data.taskCount),
        domains: skillResult.data.domains.map((entry) => entry.domain),
        scores: skillResult.data.domains.map((entry) => entry.score),
        reportId: skillResult.data.id,
        safetyLabels: skillResult.data.safetyLabels
      },
      updateStages: updateResult.data.stages.map((stage) => [stage.title, stage.description]),
      updateBundle: updateResult.data,
      studio,
      studioReports: Object.fromEntries(Object.entries(studioResults).map(([domain, adapterResult]) => [domain, adapterResult.data])),
      adapterWarnings: collectWarnings(results)
    });
  }

  global.RealForgeViewModels = Object.freeze({ createFixtureViewModels });
})(window);
