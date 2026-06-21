(function bootWorkbench(global) {
  "use strict";

  const components = global.RealForgeComponents;
  const data = global.RealForgeMockData;
  const app = document.getElementById("app");
  const topbar = document.getElementById("topbar");
  const sidebar = document.getElementById("sidebar");
  const main = document.getElementById("main");
  const statusRail = document.getElementById("status-rail");
  const dialog = document.getElementById("command-palette");
  const dialogContent = document.getElementById("command-palette-content");
  const toastRegion = document.getElementById("toast-region");

  global.__consoleErrors = global.__consoleErrors || [];
  global.addEventListener("error", (event) => {
    global.__consoleErrors.push(String(event.error || event.message || "Unknown browser error"));
  });

  const state = {
    screen: "home",
    settingsSection: "general",
    staffPreview: false,
    commandQuery: "",
    sidebarOpen: false,
    operationStatus: "Idle · ready",
    lastCommand: "none · prototype ready",
    stagedTask: "",
    importRaw: "",
    importType: "auto",
    importPreview: null
  };

  let toastTimer = null;

  function render() {
    app.dataset.screen = state.screen;
    app.classList.toggle("sidebar-open", state.sidebarOpen);
    topbar.innerHTML = components.renderTopbar(state);
    sidebar.innerHTML = components.renderSidebar(state);
    main.innerHTML = components.renderMain(state);
    statusRail.innerHTML = components.renderStatusRail(state);
    if (dialog.open) {
      renderPalette();
    }
    document.title = `RealForge · ${data.navigation.find((item) => item.id === state.screen)?.label || "Workbench"}`;
  }

  function renderPalette() {
    dialogContent.innerHTML = components.renderCommandPalette(state);
    requestAnimationFrame(() => {
      const input = document.getElementById("command-search");
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    });
  }

  function navigate(screen) {
    if (!data.navigation.some((item) => item.id === screen)) return;
    state.screen = screen;
    state.sidebarOpen = false;
    render();
    main.focus({ preventScroll: true });
  }

  function openPalette(query = "") {
    state.commandQuery = query;
    renderPalette();
    if (!dialog.open) dialog.showModal();
  }

  function closePalette() {
    if (dialog.open) dialog.close();
    state.commandQuery = "";
  }

  function showToast(message, tone = "safe") {
    clearTimeout(toastTimer);
    toastRegion.innerHTML = `<div class="toast toast--${tone}"><span class="live-dot"></span><span>${components.escapeHtml(message)}</span></div>`;
    toastRegion.classList.add("is-visible");
    toastTimer = setTimeout(() => {
      toastRegion.classList.remove("is-visible");
    }, 2600);
  }

  function syncImportRawFromDom() {
    const input = document.getElementById("import-input");
    if (input) state.importRaw = input.value;
  }

  function computeImportPreview() {
    const reportImport = global.RealForgeReportImport;
    if (!reportImport || !state.importRaw.trim()) {
      state.importPreview = null;
      return;
    }
    state.importPreview = reportImport.parseAndAdapt(state.importRaw, state.importType, {
      staffMode: state.staffPreview
    });
  }

  function previewCommand(command) {
    state.lastCommand = `${command} · previewed`;
    state.operationStatus = "Ready · no command executed";
    closePalette();
    render();
    showToast(`${command} · preview only · no backend action`);
  }

  function handleAction(action, target) {
    switch (action) {
      case "open-workbench": navigate("workbench"); break;
      case "open-code": navigate("code"); break;
      case "open-palette": openPalette(); break;
      case "toggle-sidebar":
        state.sidebarOpen = !state.sidebarOpen;
        render();
        break;
      case "toggle-staff-preview":
        state.staffPreview = !state.staffPreview;
        state.operationStatus = state.staffPreview ? "Staff UI preview · backend remains off" : "Idle · ready";
        // Keep any imported staff-only report's gating consistent with the toggle.
        if (state.importPreview) computeImportPreview();
        render();
        showToast(state.staffPreview ? "Staff UI preview enabled · backend STAFF OFF" : "Staff preview closed");
        break;
      case "mock-command":
        previewCommand(target.dataset.command || "command");
        if (target.dataset.screenTarget) navigate(target.dataset.screenTarget);
        break;
      case "safe-placeholder":
        state.operationStatus = "Blocked · prototype has no backend actions";
        render();
        showToast("Prototype only · no write, process, apply, commit, or merge", "warn");
        break;
      case "preview-import":
        syncImportRawFromDom();
        computeImportPreview();
        state.operationStatus = "Report previewed locally · no backend action";
        state.lastCommand = "report import · preview only";
        render();
        showToast("Imported JSON previewed · untrusted · no command executed");
        break;
      case "clear-import":
        state.importRaw = "";
        state.importType = "auto";
        state.importPreview = null;
        state.operationStatus = "Idle · ready";
        render();
        break;
      case "load-sample": {
        const reportImport = global.RealForgeReportImport;
        const sample = reportImport ? reportImport.getSampleById(target.dataset.sample || "") : null;
        if (!sample) {
          showToast("Sample fixture unavailable", "warn");
          break;
        }
        state.importRaw = sample.json;
        state.importType = "auto";
        computeImportPreview();
        state.operationStatus = "Sample report loaded · no backend action";
        state.lastCommand = `sample · ${sample.label}`;
        render();
        showToast(`Loaded sample: ${sample.label} · untrusted preview`);
        break;
      }
      case "copy-cli-command": {
        const cli = global.RealForgeCliSources;
        const source = cli && typeof cli.getSource === "function" ? cli.getSource(target.dataset.source || "") : null;
        if (!source) {
          showToast("Unknown report source", "warn");
          break;
        }
        // Copy the read-only bridge invocation only; the Workbench never runs it.
        const command = `node tools/realforge-report-bridge.mjs load ${source.id}`;
        const announce = () => {
          state.operationStatus = "Bridge command copied · run it, then paste the JSON below";
          state.lastCommand = `copy · ${source.displayCommand}`;
          render();
          showToast(`Copied: ${command} · read-only · no backend command executed`);
        };
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          navigator.clipboard.writeText(command).then(announce).catch(() => {
            showToast("Copy unavailable · the command is shown on screen to copy manually", "warn");
          });
        } else {
          announce();
        }
        break;
      }
      default: break;
    }
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-screen], [data-action], [data-settings-section], [data-command-pick]");
    if (!target) return;
    if (target.dataset.screen) {
      navigate(target.dataset.screen);
      return;
    }
    if (target.dataset.settingsSection) {
      state.settingsSection = target.dataset.settingsSection;
      state.screen = "settings";
      render();
      return;
    }
    if (target.dataset.commandPick) {
      previewCommand(target.dataset.commandPick);
      return;
    }
    if (target.dataset.action) handleAction(target.dataset.action, target);
  });

  document.addEventListener("submit", (event) => {
    if (event.target.id !== "workbench-form") return;
    event.preventDefault();
    const input = document.getElementById("task-input");
    const task = input?.value.trim() || "";
    if (!task) {
      showToast("Enter a task to stage a mock thread", "warn");
      return;
    }
    state.stagedTask = task;
    state.lastCommand = "task staged · no execution";
    state.operationStatus = "Task staged locally · no writes";
    render();
    showToast("Task staged in prototype · no backend command executed");
  });

  dialog.addEventListener("input", (event) => {
    if (event.target.id !== "command-search") return;
    state.commandQuery = event.target.value;
    const parts = components.renderCommandPaletteParts(state);
    dialog.querySelector(".palette-meta").innerHTML = parts.meta;
    dialog.querySelector(".command-results").innerHTML = parts.results;
  });

  document.addEventListener("input", (event) => {
    if (event.target.id !== "import-input") return;
    // Track text without re-rendering so the caret and scroll position are kept.
    state.importRaw = event.target.value;
  });

  document.addEventListener("change", (event) => {
    if (event.target.id !== "import-type") return;
    syncImportRawFromDom();
    state.importType = event.target.value;
    if (state.importRaw.trim()) computeImportPreview();
    render();
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closePalette();
  });

  dialog.addEventListener("close", () => {
    state.commandQuery = "";
  });

  document.addEventListener("keydown", (event) => {
    const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName || "");
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openPalette();
      return;
    }
    if (event.key === "/" && !typing && !dialog.open) {
      event.preventDefault();
      openPalette("/");
      return;
    }
    if (event.key === "Escape" && state.sidebarOpen) {
      state.sidebarOpen = false;
      render();
    }
  });

  render();
})(window);
