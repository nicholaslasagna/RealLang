(function registerComponents(global) {
  "use strict";

  const data = global.RealForgeMockData;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function icon(name, className = "") {
    const safe = String(name).replace(/[^a-z0-9-]/g, "");
    return `<span class="icon ${className}" aria-hidden="true" style="--icon-url:url('./assets/icons/${safe}.svg')"></span>`;
  }

  function badge(label, tone = "neutral") {
    return `<span class="badge badge--${tone}">${escapeHtml(label)}</span>`;
  }

  function sectionHeading(eyebrow, title, description = "") {
    return `<header class="page-heading">
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
      <h1>${escapeHtml(title)}</h1>
      ${description ? `<p class="page-description">${escapeHtml(description)}</p>` : ""}
    </header>`;
  }

  function button(label, iconName, action, variant = "secondary", attributes = "") {
    return `<button class="button button--${variant}" type="button" data-action="${escapeHtml(action)}" ${attributes}>
      ${icon(iconName)}<span>${escapeHtml(label)}</span>
    </button>`;
  }

  function renderTopbar(state) {
    const statusItems = [
      ["READONLY", "lock-keyhole", "amber"],
      ["LOCAL ONLY", "hard-drive", "cyan"],
      ["NETWORK OFF", "wifi-off", "neutral"],
      ["DOCTOR PASS", "shield-check", "green"],
      [state.staffPreview ? "STAFF PREVIEW" : "STAFF OFF", "shield", state.staffPreview ? "violet" : "neutral"]
    ];
    return `<div class="brand-block">
        <span class="brand-mark" aria-hidden="true"><span></span></span>
        <span class="brand-copy"><strong>REALFORGE</strong><small>AI ENGINEERING WORKBENCH</small></span>
      </div>
      <div class="top-context" aria-label="Workspace and provider">
        <span class="context-chip">${icon("folder-git-2")}<b>RealLang</b><small>workspace</small></span>
        <span class="context-chip context-chip--provider">${icon("cpu")}<b>mock</b><small>deterministic</small></span>
      </div>
      <div class="top-spacer"></div>
      <div class="top-statuses">
        ${statusItems.map(([label, iconName, tone]) => `<span class="status-pill status-pill--${tone}">${icon(iconName)}<span>${label}</span></span>`).join("")}
      </div>
      <button class="icon-button mobile-menu" type="button" data-action="toggle-sidebar" aria-label="Toggle navigation">${icon("menu")}</button>`;
  }

  function renderSidebar(state) {
    const groups = [...new Set(data.navigation.map((item) => item.group))];
    return `<div class="sidebar-scroll">
      ${groups.map((group) => `<section class="nav-group" aria-labelledby="nav-${group.toLowerCase()}">
        <h2 id="nav-${group.toLowerCase()}">${escapeHtml(group)}</h2>
        ${data.navigation.filter((item) => item.group === group).map((item) => {
          const active = state.screen === item.id;
          const locked = item.id === "updates" && !state.staffPreview;
          return `<button class="nav-item ${active ? "is-active" : ""}" type="button" data-screen="${item.id}" aria-current="${active ? "page" : "false"}">
            ${icon(item.icon)}<span>${escapeHtml(item.label)}</span>
            ${locked ? icon("lock", "nav-lock") : ""}
          </button>`;
        }).join("")}
      </section>`).join("")}
    </div>
    <div class="sidebar-version">
      <div>${icon("git-commit-horizontal")}<strong>VERSION ${escapeHtml(data.version)}</strong></div>
      <p>Skill benchmarks · bounded improvement · output untrusted until validated.</p>
    </div>`;
  }

  function renderStatusRail(state) {
    return `<span class="rail-state"><span class="live-dot"></span>${escapeHtml(state.operationStatus)}</span>
      <span class="rail-divider"></span><span>${icon("file-x")}NO WRITES</span>
      <span class="rail-divider"></span><span class="rail-dry">${icon("flask-conical")}DRY RUN</span>
      <span class="rail-divider"></span><span>approval: <b>MANUAL</b></span>
      <span class="rail-spacer"></span><span class="rail-command">latest: ${escapeHtml(state.lastCommand)}</span>`;
  }

  function metricCard(title, iconName, content, footer = "", tone = "cyan", emphasis = "") {
    return `<article class="metric-card metric-card--${tone} ${emphasis ? `metric-card--${emphasis}` : ""}">
      <header>${icon(iconName)}<span>${escapeHtml(title)}</span></header>
      <div class="metric-card__content">${content}</div>
      ${footer ? `<footer>${footer}</footer>` : ""}
    </article>`;
  }

  function renderHome() {
    const health = metricCard("Workspace health", "activity", `<div class="health-score"><strong>8</strong><span>/10</span></div>
      <div class="mini-list"><span><i class="dot dot--green"></i>8 PASS</span><span><i class="dot dot--amber"></i>2 WARN</span><span><i class="dot"></i>0 BLOCKED</span></div>`, "Boundary and permission gates active", "green", "featured");
    const provider = metricCard("Provider / model", "server", `<strong class="metric-main">mock</strong><span class="metric-sub">deterministic · offline</span>`, `${badge("LOCAL ONLY", "cyan")} ${badge("TEXT", "neutral")}`, "cyan");
    const benchmark = metricCard("Latest benchmark", "trophy", `<div class="score-line"><strong>0.86</strong><span>+0.04</span></div><div class="sparkline">${[42,50,47,61,67,72,78,86].map((height, index) => `<i style="height:${height}%" class="${index === 7 ? "is-last" : ""}"></i>`).join("")}</div>`, "planning suite · static mock", "amber");
    const validation = metricCard("Latest validation", "badge-check", `<ul class="validation-list"><li>realc --check ${badge("PASS", "green")}</li><li>pytest · full ${badge("PASS", "green")}</li><li>git diff --check ${badge("PASS", "green")}</li></ul>`, "No workspace writes", "green");
    return `<div class="screen screen--home">
      <section class="home-hero">
        <div class="hero-copy">
          <p class="eyebrow"><span class="live-dot"></span>LOCAL ENVIRONMENT · V${escapeHtml(data.version)}</p>
          <h1>RealForge is ready</h1>
          <p>Local-first AI engineering workbench with safe defaults already active.</p>
          <div class="hero-actions">
            ${button("Open Workbench", "square-terminal", "open-workbench", "primary")}
            ${button("Browse commands", "command", "open-palette", "ghost", 'aria-keyshortcuts="Meta+K Control+K"')}
          </div>
        </div>
        <div class="hero-signal"><span class="signal-mark" aria-hidden="true"><i></i></span><div><b>SAFE DEFAULTS</b><strong>Ready for bounded work</strong><small>Readonly · local only · network off · approval manual</small></div></div>
      </section>

      <section class="dashboard-section">
        <div class="section-label"><span>WORKSPACE STATUS</span><i></i></div>
        <div class="metrics-grid">${health}${provider}${benchmark}${validation}</div>
      </section>

      <section class="home-lower">
        <article class="list-panel list-panel--primary">
          <header><div><p class="eyebrow">RECENT TASKS</p><h2>Reviewable local history</h2></div>${button("Open workbench", "arrow-right", "open-workbench", "ghost")}</header>
          <div class="task-list">
            ${[
              ["wrench", "Repair i32 overflow · looptest.real", "DRY RUN", "blue", "2m"],
              ["list-checks", "Plan benchmark suite expansion", "VALIDATED", "green", "18m"],
              ["drama", "Creative brief · aerial duel arena", "UNTRUSTED", "amber", "1h"],
              ["eye", "Vision analyze · concept.png", "WARN", "amber", "3h"]
            ].map(([ic, title, status, tone, time]) => `<button class="task-row" type="button" data-action="open-workbench">${icon(ic)}<span><b>${escapeHtml(title)}</b><small>${time} ago · mock artifact</small></span>${badge(status, tone)}${icon("chevron-right")}</button>`).join("")}
          </div>
        </article>
        <article class="action-panel">
          <p class="eyebrow">SUGGESTED NEXT ACTIONS</p>
          <h2>Continue safely</h2>
          <div class="suggestion-list">
            ${[
              ["/check", "Validate examples after the last edit", "workbench"],
              ["/skill-bench", "Refresh capability-domain scores", "benchmarks"],
              ["/doctor", "Review two configuration warnings", "settings"]
            ].map(([cmd, desc, screen]) => `<button type="button" data-screen="${screen}"><code>${cmd}</code><span>${escapeHtml(desc)}</span>${icon("arrow-right")}</button>`).join("")}
          </div>
        </article>
      </section>
    </div>`;
  }

  function renderPlanCard() {
    const steps = [
      "Inspect looptest.real and locate the E221 i32 literal-range diagnostic.",
      "Identify the overflowing multiplication and binding type.",
      "Propose a conservative widening without changing unrelated code.",
      "Validate with realc --check and focused runtime tests."
    ];
    return `<article class="report-card report-card--cyan">
      <header>${icon("list-checks")}<b>STRUCTURED PLAN</b><span>4 steps</span></header>
      <ol class="plan-list">${steps.map((step, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(step)}</p></li>`).join("")}</ol>
      <div class="report-meta"><span>Writes files? <b>NO</b></span><span>Runs commands? <b>NO</b></span><span>Network? <b>NO</b></span></div>
    </article>`;
  }

  function renderPatchCard() {
    return `<article class="report-card report-card--blue">
      <header>${icon("git-pull-request-arrow")}<b>PATCH PROPOSAL</b><span>${badge("DRY RUN", "blue")}<button class="card-action" type="button" data-action="safe-placeholder">Review proposal ${icon("arrow-right")}</button></span></header>
      <div class="diff-block"><div>examples/looptest.real</div><del>- let total: i32 = sum * 100000</del><ins>+ let total: i32 = wrapped_total(sum)</ins></div>
      <div class="report-meta"><span>Patch target: <b>1 file</b></span><span>Writes files? <b>NO</b></span><span>Status: <em>PENDING</em></span></div>
    </article>`;
  }

  function renderValidationCard() {
    return `<article class="report-card report-card--green">
      <header>${icon("badge-check")}<b>VALIDATION</b><span>${badge("VALIDATED", "green")}</span></header>
      <div class="validation-commands"><span>${icon("circle-check")}<code>realc --check</code></span><span>${icon("circle-check")}<code>pytest smoke</code></span><span>${icon("circle-check")}<code>i32 wrap runtime</code></span></div>
    </article>`;
  }

  function renderInspector() {
    return `<aside class="inspector" aria-label="Task inspector">
      <header>${icon("panel-right")}<b>CONTEXT BUNDLE</b></header>
      <section><h3>FILES REFERENCED</h3>${[
        ["examples/looptest.real", "1.2k"],
        ["docs/language-semantics.md", "8.4k"],
        ["tests/test_i32_wrapping_runtime.py", "3.1k"]
      ].map(([name, size]) => `<div class="file-row">${icon("file-code-2")}<code>${name}</code><small>${size}</small></div>`).join("")}</section>
      <section><h3>VALIDATION COMMANDS</h3><code class="command-line">realc --check</code><code class="command-line">pytest -q tests/test_i32_wrapping_runtime.py</code></section>
      <section><h3>RISKS</h3><p class="risk-note">${icon("triangle-alert")}Generated patch details are illustrative and not valid RealLang syntax.</p></section>
      <section class="proposal-facts"><div><span>Proposal status</span><b>PENDING</b></div><div><span>Update bundle</span><b>NONE</b></div><div><span>Patch hash</span><code>a3f7…91c</code></div></section>
      <section><h3>NEXT SAFE COMMAND</h3><code class="next-command">realforge propose-patch --task … --dry-run</code></section>
    </aside>`;
  }

  function renderWorkbench(state) {
    const stagedTask = state.stagedTask ? `<div class="thread-message thread-message--user">${escapeHtml(state.stagedTask)}<small>staged locally · not executed</small></div>` : "";
    return `<div class="workbench-layout">
      <section class="workbench-main">
        <header class="workbench-header"><div><p class="eyebrow">WORKBENCH · CODE</p><h1>Dry-run repair plan</h1><span>Review the plan, proposal, and evidence before any future apply step.</span></div><div>${badge("DRY RUN", "blue")}${badge("NO WRITES", "green")}</div></header>
        <div class="thread-scroll"><div class="thread">
          ${stagedTask}
          <div class="thread-message thread-message--user">Plan a fix for the i32 overflow diagnostic in <code>examples/looptest.real</code> and validate it. Dry run only.</div>
          <div class="agent-label"><span class="mini-mark"></span><b>RealForge</b><small>mock · planner</small>${badge("UNTRUSTED PROVIDER OUTPUT", "amber")}</div>
          ${renderPlanCard()}${renderPatchCard()}${renderValidationCard()}
        </div></div>
        <form class="composer" id="workbench-form">
          <div class="composer-context"><span>@RealLang</span><span>12 files</span><span>realc diagnostics</span><small>Provider output remains untrusted</small></div>
          <div class="composer-box">${button("Slash", "slash", "open-palette", "slash")}<label class="sr-only" for="task-input">Workbench task</label><textarea id="task-input" rows="1" placeholder="Describe a task, or type / for commands"></textarea><button class="send-button" type="submit" aria-label="Stage mock task">${icon("arrow-up")}</button></div>
        </form>
      </section>${renderInspector()}
    </div>`;
  }

  function capabilityTone(status) {
    return status === "available" ? "green" : status === "staff-only" ? "violet" : "cyan";
  }

  function renderCapabilities() {
    return `<div class="screen">${sectionHeading("CAPABILITY REGISTRY", "Capabilities", "One trust-oriented loop across every domain. Provider, research, and generated output stays untrusted until validated.")}
      <div class="page-action-row"><span>${icon("shield-check")}11 registered domains · 3 available · 1 staff-only</span>${button("Open Workbench", "square-terminal", "open-workbench", "primary")}</div>
      <div class="capability-grid">${data.capabilities.map((cap) => `<article class="capability-card">
        <header><span class="capability-icon">${icon(cap.icon)}</span><h2>${escapeHtml(cap.domain)}</h2>${badge(cap.status.toUpperCase(), capabilityTone(cap.status))}</header>
        <p>${escapeHtml(cap.description)}</p>
        <div class="capability-badges">${badge(cap.safety.toUpperCase(), cap.safety.includes("untrusted") ? "amber" : "blue")}${badge(`WRITES ${cap.writes.toUpperCase()}`, cap.writes === "yes" ? "amber" : "neutral")}${cap.staff ? badge("STAFF", "violet") : badge("NO STAFF", "neutral")}${cap.network ? badge("NETWORK", "amber") : badge("LOCAL", "cyan")}</div>
        <footer>${icon("terminal")}<code>${escapeHtml(cap.next)}</code></footer>
      </article>`).join("")}</div>
    </div>`;
  }

  function emptyState(iconName, eyebrow, title, description, commands, tone = "cyan") {
    return `<div class="screen domain-screen">${sectionHeading(eyebrow, title, description)}
      <section class="empty-state empty-state--${tone}">
        <span class="empty-state__icon">${icon(iconName)}</span>
        <div><p class="eyebrow">SAFE START</p><h2>Start with a bounded request</h2><p>Choose a command to preview structured output. No backend command runs and no workspace file changes.</p></div>
        <div class="empty-commands">${commands.map(([label, screen], index) => `<button class="${index === 0 ? "is-primary" : ""}" type="button" data-action="mock-command" data-command="${escapeHtml(label)}" data-screen-target="${screen || ""}"><code>${escapeHtml(label)}</code><span>${index === 0 ? "Preview workflow" : "View context"}</span>${icon("arrow-right")}</button>`).join("")}</div>
      </section>
    </div>`;
  }

  function renderCode() {
    return `<div class="screen domain-screen">${sectionHeading("CODE · COMPILER GUIDED", "Repository work, bounded by diagnostics.", "RealLang checks, structured diagnostics, dry-run repairs, and validated patch proposals without an IDE clone.")}
      <div class="two-column-panels">
        <section class="feature-panel"><header>${icon("folder-git-2")}<div><p class="eyebrow">REPOSITORY MAP</p><h2>RealLang</h2></div>${badge("INDEXED", "green")}</header><div class="repo-tree"><code>src/reallang/</code><span>compiler · 18 files</span><code>src/realforge/</code><span>agent platform · 42 files</span><code>tests/</code><span>436 passing</span><code>docs/</code><span>semantics and workflows</span></div></section>
        <section class="feature-panel"><header>${icon("activity")}<div><p class="eyebrow">DIAGNOSTIC SIGNAL</p><h2>Structured output</h2></div>${badge("STABLE CODES", "cyan")}</header><div class="diagnostic-example"><code>E221 · integer literal out of range</code><p>Repair guidance is explicit, machine-readable, and scoped to one location.</p><button type="button" data-action="open-workbench">Open dry-run repair ${icon("arrow-right")}</button></div></section>
      </div>
    </div>`;
  }

  function renderResearch() {
    return emptyState("globe", "RESEARCH · PERMISSIONED", "Research only when you allow it.", "HTTPS sources require an explicit domain allowlist. Saved content remains untrusted and never edits the workspace.", [["/research", ""], ["/context", "workbench"]], "amber");
  }

  function renderStudio(screen) {
    const content = data.studio[screen];
    const tabs = ["creative", "image", "vision", "engine", "assets"];
    const [exampleTitle, exampleIcon, exampleDescription, exampleCommand, exampleAction] = content.example;
    return `<div class="screen studio-screen">
      <div class="studio-tabs" role="tablist" aria-label="Creative workflows">${tabs.map((tab) => `<button type="button" role="tab" aria-selected="${screen === tab}" class="${screen === tab ? "is-active" : ""}" data-screen="${tab}">${icon(data.navigation.find((item) => item.id === tab).icon)}${tab[0].toUpperCase() + tab.slice(1)}</button>`).join("")}</div>
      ${sectionHeading(content.eyebrow, content.title, content.description)}
      <div class="workflow-notice workflow-notice--${content.accent}">${icon("shield-alert")}<span>Planning artifact only · no silent writes · no tool execution · human review required</span></div>
      <section class="studio-launch studio-launch--${content.accent}">
        <span class="studio-launch__icon">${icon(exampleIcon)}</span>
        <div><p class="eyebrow">START WITH AN EXAMPLE</p><h2>${escapeHtml(exampleTitle)}</h2><p>${escapeHtml(exampleDescription)}</p><code>${escapeHtml(exampleCommand)}</code></div>
        ${button(exampleAction, "arrow-right", "mock-command", "primary", `data-command="${escapeHtml(exampleCommand)}"`)}
      </section>
      <div class="workflow-section-heading"><div><p class="eyebrow">AVAILABLE WORKFLOWS</p><h2>Structured planning surfaces</h2></div><span>Provider output remains untrusted until validated</span></div>
      <div class="workflow-grid">${content.items.map(([title, iconName, description, command, status]) => `<article class="workflow-card">
        <header><span>${icon(iconName)}</span>${badge(status, status === "UNTRUSTED" ? "amber" : status === "APPROVAL" ? "violet" : status === "READ ONLY" ? "cyan" : "blue")}</header>
        <h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p>
        <footer><code>${escapeHtml(command)}</code><button class="icon-button" type="button" data-action="mock-command" data-command="${escapeHtml(command)}" aria-label="Preview ${escapeHtml(title)}">${icon("arrow-right")}</button></footer>
      </article>`).join("")}</div>
      <section class="studio-empty"><div>${icon("circle-dot")}<span><b>No planning artifacts yet</b><small>Future validated CLI reports will appear here. This prototype stores nothing.</small></span></div>${button("Browse all commands", "command", "open-palette", "ghost")}</section>
    </div>`;
  }

  function renderBenchmarks() {
    const bench = data.benchmarks;
    return `<div class="screen">${sectionHeading("BENCHMARKS · LOCAL", "Measure before trust.", "Static mock results show how task, skill, safety, and leaderboard reports could be presented without superiority claims.")}
      <div class="page-action-row"><span>${icon("shield-check")}Gate ${bench.gate} · current result passes</span>${button("Preview skill bench", "play", "mock-command", "primary", 'data-command="/skill-bench"')}</div>
      <div class="benchmark-summary"><article><span>Overall score</span><strong>${bench.overall}</strong><small>gate ${bench.gate} · PASS</small></article><article><span>Tasks</span><strong>${bench.tasks}</strong><small>skill-bench smoke suite</small></article><article><span>Safety outcomes</span><strong>0</strong><small>unsafe suggestions applied</small></article></div>
      <section class="benchmark-panel"><header><div><p class="eyebrow">SKILL-BENCH DOMAIN SCORES</p><h2>Capability profile</h2></div>${badge("MOCK DATA", "neutral")}</header><div class="score-list">${bench.domains.map((domain, index) => `<div><span>${escapeHtml(domain)}</span><i><b style="width:${bench.scores[index] * 100}%"></b></i><code>${bench.scores[index].toFixed(2)}</code></div>`).join("")}</div></section>
    </div>`;
  }

  function renderUpdates(state) {
    if (!state.staffPreview) {
      return `<div class="screen updates-screen">${sectionHeading("UPDATES · STAFF-ONLY CHANNEL", "Locked by policy. Ready for review.", "Staff Off is the intentional default. Advanced improvement controls remain unavailable to normal users.")}
        <section class="staff-lock"><span>${icon("lock-keyhole")}</span><div><p class="eyebrow">STAFF OFF · POLICY ENFORCED</p><h2>The update channel is securely gated</h2><p>You can inspect a visual preview of the review sequence. Previewing does not enable staff mode, execute a step, or change backend state.</p></div>${button("Preview guarded flow", "eye", "toggle-staff-preview", "violet")}</section>
        <div class="safety-triptych"><article><b>NO AUTO-APPLY</b><span>Manual confirmation remains mandatory.</span></article><article><b>NO AUTO-COMMIT</b><span>Prototype actions never touch Git.</span></article><article><b>APPROVAL REQUIRED</b><span>Every destructive transition stays gated.</span></article></div>
        <section class="locked-flow-preview" aria-label="Staff update flow preview"><header><span>STAFF-ONLY UPDATE CHANNEL</span><b>7 REVIEW GATES</b></header><div>${data.updateStages.map(([title], index) => `<span><i>${String(index + 1).padStart(2, "0")}</i>${escapeHtml(title)}</span>`).join("")}</div></section>
      </div>`;
    }
    return `<div class="screen updates-screen">${sectionHeading("UPDATES · PREVIEW MODE", "Staff-approved improvement cycle.", "Visual preview only. The backend remains off and STAFF OFF remains the actual state.")}
      <div class="preview-banner">${icon("eye")}<span><b>STAFF UI PREVIEW</b> · no backend setting changed · no action can apply or commit</span>${button("Exit preview", "x", "toggle-staff-preview", "ghost")}</div>
      <section class="update-flow">${data.updateStages.map(([title, description], index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><div>${icon(["shield-check", "search", "git-pull-request-arrow", "flask-conical", "package", "eye", "user-round-check"][index])}<h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>${index < data.updateStages.length - 1 ? `<i>${icon("chevron-right")}</i>` : ""}</article>`).join("")}</section>
      <section class="manual-gate"><div>${icon("shield-alert")}<span><b>Manual apply remains outside this prototype.</b><small>No auto-apply · no auto-commit · no auto-merge.</small></span></div>${button("Preview next gate", "play", "safe-placeholder", "violet")}</section>
    </div>`;
  }

  function renderSettings(state) {
    const current = data.settingsSections.find((section) => section.id === state.settingsSection) || data.settingsSections[0];
    const fields = data.settings[current.id] || [];
    const staffSection = current.id === "staff" || current.id === "scheduler";
    const descriptions = {
      general: "Appearance and local prototype behavior.",
      workspace: "Bounded paths and artifact locations for the active repository.",
      provider: "Deterministic local provider state and multimodal readiness.",
      permissions: "Effective write, command, and destructive-action boundaries.",
      research: "Network access remains off until an explicit allowlist is supplied.",
      staff: "Advanced update controls are disabled and hidden by default.",
      scheduler: "Bounded staff jobs with hard limits and no automatic apply step.",
      benchmarks: "Validation thresholds used before any output can earn confidence.",
      creative: "Planning-only multimodal capabilities and provenance settings.",
      engine: "Read-only detection and planning for Unreal and Blender workflows.",
      doctor: "Current safety posture across workspace, provider, network, and update gates."
    };
    return `<div class="settings-layout">
      <aside class="settings-nav"><p class="eyebrow">SETTINGS</p>${data.settingsSections.map((section) => `<button type="button" class="${current.id === section.id ? "is-active" : ""}" data-settings-section="${section.id}">${icon(section.icon)}<span>${escapeHtml(section.label)}</span>${section.id === "staff" || section.id === "scheduler" ? badge("STAFF", "violet") : ""}</button>`).join("")}</aside>
      <section class="settings-content"><header><div><p class="eyebrow">EFFECTIVE CONFIGURATION</p><h1>${escapeHtml(current.label)}</h1><p>${escapeHtml(descriptions[current.id] || "Read-only prototype configuration.")}</p></div>${badge("READ ONLY", "green")}</header>
        <div class="settings-safety-strip"><span>${icon("lock-keyhole")}<b>READONLY</b></span><span>${icon("hard-drive")}<b>LOCAL ONLY</b></span><span>${icon("wifi-off")}<b>NETWORK OFF</b></span><span>${icon("shield")}<b>STAFF OFF</b></span></div>
        ${staffSection ? `<div class="staff-settings-gate">${icon("lock-keyhole")}<span><b>Staff-only controls are gated.</b><small>Display values cannot enable staff mode or scheduler execution.</small></span>${badge("LOCKED", "violet")}</div>` : ""}
        ${current.id === "doctor" ? renderDoctor() : `<div class="settings-fields ${staffSection ? "settings-fields--gated" : ""}">${fields.map(([label, value, note]) => `<div><span><b>${escapeHtml(label)}</b><small>${escapeHtml(note)}</small></span><code>${escapeHtml(value)}</code>${staffSection ? icon("lock", "field-lock") : ""}</div>`).join("")}</div>`}
        <footer class="settings-footer">${icon("shield-check")}<span><b>Safe defaults are active.</b> Changes are unavailable in this static prototype.</span></footer>
      </section>
    </div>`;
  }

  function renderDoctor() {
    const checks = [
      ["Workspace boundary", "PASS", "Writes confined to workspace root."],
      ["Staff and scheduler gates", "PASS", "Disabled by default."],
      ["auto_apply / auto_commit", "PASS", "Unsupported and refused."],
      ["Local provider", "WARN", "Deterministic mock fallback active."],
      ["Research network", "PASS", "Network off; allowlist required."],
      ["Artifact gitignore", "PASS", ".realforge outputs covered."],
      ["Provider output trust", "WARN", "Untrusted until validated by design."]
    ];
    return `<div class="doctor-summary"><div><strong>5</strong><span>PASS</span></div><div><strong>2</strong><span>WARN</span></div><div><strong>0</strong><span>BLOCKED</span></div></div><div class="doctor-list">${checks.map(([label, status, note]) => `<div>${icon(status === "PASS" ? "circle-check" : "triangle-alert")}<span><b>${label}</b><small>${note}</small></span>${badge(status, status === "PASS" ? "green" : "amber")}</div>`).join("")}</div>`;
  }

  function renderMain(state) {
    switch (state.screen) {
      case "home": return renderHome();
      case "workbench": return renderWorkbench(state);
      case "capabilities": return renderCapabilities();
      case "code": return renderCode();
      case "research": return renderResearch();
      case "creative":
      case "image":
      case "vision":
      case "engine":
      case "assets": return renderStudio(state.screen);
      case "benchmarks": return renderBenchmarks();
      case "updates": return renderUpdates(state);
      case "settings": return renderSettings(state);
      default: return renderHome();
    }
  }

  function commandTone(command) {
    if (command.staff) return "violet";
    if (command.network) return "amber";
    if (command.safety === "READ ONLY") return "cyan";
    if (command.safety === "BENCHMARK") return "green";
    if (command.safety === "DRY RUN" || command.safety === "PLANNING") return "blue";
    return "amber";
  }

  function renderCommandPaletteParts(state) {
    const query = state.commandQuery.trim().toLowerCase();
    const commands = data.commands.filter((command) => !query || `${command.command} ${command.domain} ${command.description} ${command.safety}`.toLowerCase().includes(query));
    return {
      meta: `<span>${query ? `RESULTS FOR “${escapeHtml(state.commandQuery)}”` : "ALL CAPABILITY DOMAINS"}</span><span>${commands.length} OF ${data.commands.length} COMMANDS</span>`,
      results: commands.length ? commands.map((command) => `<button type="button" data-command-pick="${escapeHtml(command.command)}"><span class="command-name"><code>${escapeHtml(command.command)}</code><small>${escapeHtml(command.domain)}</small></span><span class="command-description">${escapeHtml(command.description)}</span><span class="command-badges">${badge(command.safety, commandTone(command))}${badge(command.writes === "no" ? "NO WRITES" : `WRITES ${command.writes.toUpperCase()}`, command.writes === "no" ? "green" : "neutral")}${command.staff ? badge("STAFF ONLY", "violet") : ""}${command.network ? badge("NETWORK", "amber") : ""}</span>${icon("arrow-right")}</button>`).join("") : `<div class="palette-empty">${icon("search")}<h2>No command found</h2><p>Try a domain such as code, image, engine, eval, or staff.</p><button type="button" data-action="open-palette">Clear search</button></div>`
    };
  }

  function renderCommandPalette(state) {
    const parts = renderCommandPaletteParts(state);
    return `<form class="command-palette-form" method="dialog">
      <header><span class="palette-icon">${icon("command")}</span><div class="palette-search"><span>REALFORGE COMMAND CENTER</span><label class="sr-only" for="command-search">Search commands</label><input id="command-search" type="search" autocomplete="off" placeholder="Search commands, domains, or safety levels" value="${escapeHtml(state.commandQuery)}" /></div><button class="icon-button" value="close" aria-label="Close command palette">${icon("x")}</button></header>
      <div class="palette-meta">${parts.meta}</div>
      <div class="command-results">${parts.results}</div>
      <footer><span>${icon("shield-check")} Preview only</span><span>${icon("file-x")} No writes</span><b>Provider output remains untrusted until validated</b></footer>
    </form>`;
  }

  global.RealForgeComponents = Object.freeze({
    renderTopbar,
    renderSidebar,
    renderStatusRail,
    renderMain,
    renderCommandPalette,
    renderCommandPaletteParts,
    escapeHtml
  });
})(window);
