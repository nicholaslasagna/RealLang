(function registerMockData(global) {
  "use strict";

  const viewModelFactory = global.RealForgeViewModels;
  const fixtures = global.RealForgeFixtureData;
  if (!viewModelFactory || !fixtures) throw new Error("Workbench report fixtures and adapters must load before mock data");

  /** @typedef {{id:string,label:string,icon:string,group:string}} NavigationItem */

  /** @type {readonly NavigationItem[]} */
  const navigation = Object.freeze([
    { id: "home", label: "Home", icon: "house", group: "Start" },
    { id: "workbench", label: "Workbench", icon: "square-terminal", group: "Start" },
    { id: "code", label: "Code", icon: "code-xml", group: "Build" },
    { id: "research", label: "Research", icon: "globe", group: "Build" },
    { id: "creative", label: "Creative", icon: "drama", group: "Studio" },
    { id: "image", label: "Image", icon: "image", group: "Studio" },
    { id: "vision", label: "Vision", icon: "eye", group: "Studio" },
    { id: "engine", label: "Engine", icon: "box", group: "Studio" },
    { id: "assets", label: "Assets", icon: "package", group: "Studio" },
    { id: "capabilities", label: "Capabilities", icon: "layers", group: "Evaluate" },
    { id: "benchmarks", label: "Benchmarks", icon: "gauge", group: "Evaluate" },
    { id: "security", label: "Security", icon: "shield-alert", group: "Evaluate" },
    { id: "reports", label: "Reports", icon: "clipboard-list", group: "Evaluate" },
    { id: "settings", label: "Settings", icon: "settings", group: "System" },
    { id: "updates", label: "Updates", icon: "shield", group: "System" }
  ]);

  const reports = viewModelFactory.createFixtureViewModels(fixtures, { staffMode: false });

  global.RealForgeMockData = Object.freeze({
    version: "2.7",
    workbenchVersion: "0.4",
    navigation,
    ...reports
  });
})(window);
