(function registerMockData(global) {
  "use strict";

  /** @typedef {{id:string,label:string,icon:string,group:string}} NavigationItem */
  /** @typedef {{command:string,description:string,safety:string,writes:string,staff:boolean,network:boolean}} SlashCommand */
  /** @typedef {{domain:string,icon:string,status:string,safety:string,writes:string,staff:boolean,network:boolean,description:string,next:string}} Capability */

  /** @type {readonly NavigationItem[]} */
  const navigation = Object.freeze([
    { id: "home", label: "Home", icon: "house", group: "Core" },
    { id: "workbench", label: "Workbench", icon: "square-terminal", group: "Core" },
    { id: "capabilities", label: "Capabilities", icon: "layers", group: "Core" },
    { id: "code", label: "Code", icon: "code-xml", group: "Engineering" },
    { id: "research", label: "Research", icon: "globe", group: "Engineering" },
    { id: "creative", label: "Creative", icon: "drama", group: "Studio" },
    { id: "image", label: "Image", icon: "image", group: "Studio" },
    { id: "vision", label: "Vision", icon: "eye", group: "Studio" },
    { id: "engine", label: "Engine", icon: "box", group: "Studio" },
    { id: "assets", label: "Assets", icon: "package", group: "Studio" },
    { id: "benchmarks", label: "Benchmarks", icon: "gauge", group: "Evaluate" },
    { id: "updates", label: "Updates", icon: "shield", group: "System" },
    { id: "settings", label: "Settings", icon: "settings", group: "System" }
  ]);

  /** @type {readonly Capability[]} */
  const capabilities = Object.freeze([
    { domain: "code", icon: "code-xml", status: "available", safety: "compiler-guided", writes: "optional", staff: false, network: false, description: "Repository context, realc diagnostics, dry-run repairs, and validated patch proposals.", next: "realforge check examples/hello.real" },
    { domain: "docs", icon: "file-text", status: "available", safety: "review-required", writes: "optional", staff: false, network: false, description: "Documentation planning and generation with explicit review before writes.", next: "realforge plan --task \"update docs\"" },
    { domain: "research", icon: "globe", status: "experimental", safety: "network-gated", writes: "optional", staff: false, network: true, description: "Permissioned HTTPS research with explicit domain allowlists and untrusted snapshots.", next: "realforge research --url … --allow-domain …" },
    { domain: "creative", icon: "drama", status: "experimental", safety: "planning-only", writes: "optional", staff: false, network: false, description: "Game, map, and asset briefs as structured planning artifacts.", next: "realforge creative brief --task \"…\"" },
    { domain: "image", icon: "image", status: "experimental", safety: "planning-only", writes: "optional", staff: false, network: false, description: "Prompt jobs, packs, provenance, and reference boards. No binary generation.", next: "realforge image job --task \"…\"" },
    { domain: "vision", icon: "eye", status: "experimental", safety: "untrusted-output", writes: "optional", staff: false, network: false, description: "Bounded image reports. Mock mode performs no semantic recognition.", next: "realforge vision understand --image … --task \"…\"" },
    { domain: "engine", icon: "box", status: "experimental", safety: "dry-run-only", writes: "optional", staff: false, network: false, description: "Read-only project scans and approval-gated Unreal/engine plans.", next: "realforge engine scan --path …" },
    { domain: "assets", icon: "package", status: "experimental", safety: "planning-only", writes: "optional", staff: false, network: false, description: "Asset and Blender pipeline plans without DCC execution or binary output.", next: "realforge asset pipeline --task \"…\"" },
    { domain: "eval", icon: "gauge", status: "available", safety: "benchmark-aware", writes: "yes", staff: false, network: false, description: "Repeatable provider evaluations, task benchmarks, skill benches, and local leaderboards.", next: "realforge skill-bench --provider mock --suite smoke" },
    { domain: "self-improvement", icon: "flask-conical", status: "experimental", safety: "isolated", writes: "optional", staff: false, network: false, description: "Bounded proposals and isolated experiments. Apply remains manual and approval-gated.", next: "realforge improve --dry-run" },
    { domain: "scheduler", icon: "calendar-clock", status: "staff-only", safety: "staff-gated", writes: "optional", staff: true, network: false, description: "Bounded staff improvement jobs with benchmark gates and no automatic apply or commit.", next: "realforge scheduler-status" }
  ]);

  /** @type {readonly SlashCommand[]} */
  const commands = Object.freeze([
    ["/ask", "Request a concise local-provider plan", "UNTRUSTED", "no", false, false],
    ["/plan", "Build a structured task plan", "UNTRUSTED", "no", false, false],
    ["/check", "Run compiler-guided checks", "READ ONLY", "no", false, false],
    ["/repair", "Preview conservative repairs", "DRY RUN", "no", false, false],
    ["/context", "Build bounded workspace context", "READ ONLY", "no", false, false],
    ["/research", "Fetch one allowlisted HTTPS source", "NETWORK GATED", "optional", false, true],
    ["/creative brief", "Create a game design brief", "UNTRUSTED", "optional", false, false],
    ["/creative map", "Create a map or world plan", "UNTRUSTED", "optional", false, false],
    ["/image prompt", "Create a prompt specification", "PLANNING", "optional", false, false],
    ["/image job", "Create an image workflow job", "PLANNING", "optional", false, false],
    ["/vision analyze", "Create a simple image report", "UNTRUSTED", "optional", false, false],
    ["/vision understand", "Create a rich image report", "UNTRUSTED", "optional", false, false],
    ["/engine scan", "Scan an engine project", "READ ONLY", "no", false, false],
    ["/unreal plan", "Create a dry-run Unreal plan", "DRY RUN", "optional", false, false],
    ["/asset pipeline", "Create an asset production plan", "DRY RUN", "optional", false, false],
    ["/bench", "Run task benchmark summaries", "BENCHMARK", "yes", false, false],
    ["/skill-bench", "Run capability-domain skill tasks", "BENCHMARK", "yes", false, false],
    ["/leaderboard", "Show local provider rankings", "READ ONLY", "no", false, false],
    ["/doctor", "Check environment safety", "READ ONLY", "no", false, false],
    ["/settings", "Review effective settings", "READ ONLY", "no", false, false],
    ["/staff-status", "Inspect staff-mode state", "STAFF ONLY", "no", true, false],
    ["/update-check", "Review update candidates", "STAFF ONLY", "optional", true, false],
    ["/scheduler", "Inspect bounded scheduler state", "STAFF ONLY", "optional", true, false]
  ].map(([command, description, safety, writes, staff, network]) => Object.freeze({ command, description, safety, writes, staff, network })));

  const studio = Object.freeze({
    creative: {
      eyebrow: "CREATIVE PLANNING",
      title: "Turn direction into structured briefs.",
      description: "Game, map, and asset planning stays explicit, reviewable, and untrusted.",
      accent: "violet",
      items: [
        ["Creative brief", "drama", "Genre, roles, mechanics, tone, constraints, and validation questions.", "realforge creative brief --task \"…\"", "UNTRUSTED"],
        ["Map design", "map", "Traversal, landmarks, encounter zones, lighting, and performance notes.", "realforge creative map --task \"…\"", "UNTRUSTED"],
        ["Asset brief", "package", "Silhouette, materials, engine constraints, collision, LODs, and review gates.", "realforge creative asset --task \"…\"", "UNTRUSTED"]
      ]
    },
    image: {
      eyebrow: "IMAGE WORKFLOWS",
      title: "Plan images before generation exists.",
      description: "Prompt jobs, prompt packs, reference hashes, iteration plans, and provenance metadata.",
      accent: "amber",
      items: [
        ["Image job", "image", "A complete prompt and iteration specification with provenance.", "realforge image job --task \"…\"", "PLANNING"],
        ["Prompt pack", "wand-sparkles", "Base prompt, negative prompt, variants, and production notes.", "realforge image prompt-pack --task \"…\"", "PLANNING"],
        ["Reference board", "images", "Workspace-bounded image hashes and metadata. No semantic analysis.", "realforge image references --image …", "READ ONLY"]
      ]
    },
    vision: {
      eyebrow: "VISION REPORTS",
      title: "Inspect images through explicit trust boundaries.",
      description: "Mock output is deterministic scaffolding with confidence 0.0, not semantic recognition.",
      accent: "cyan",
      items: [
        ["Understand", "scan-eye", "Creative, gameplay, asset, and map-planning report fields.", "realforge vision understand --image … --task \"…\"", "UNTRUSTED"],
        ["Compare", "images", "Hash-aware multi-image comparison report with explicit limitations.", "realforge vision compare --image … --image …", "UNTRUSTED"],
        ["Asset brief", "clipboard-list", "Image-linked AssetBrief scaffolding with manual review requirements.", "realforge vision asset-brief --image …", "UNTRUSTED"]
      ]
    },
    engine: {
      eyebrow: "ENGINE PLANNING",
      title: "Prepare engine work without touching projects.",
      description: "Read-only scans and approval-gated Unreal and Blender planning. No process launches.",
      accent: "blue",
      items: [
        ["Project scan", "search", "Detect .uproject, Config, Content, Source, and plugin descriptors.", "realforge engine scan --path …", "READ ONLY"],
        ["Unreal plan", "box", "Dry-run implementation and validation steps with inert command suggestions.", "realforge unreal plan --path … --task \"…\"", "DRY RUN"],
        ["Blender plan", "blocks", "Modeling, UV, bake, export, collision, and LOD planning only.", "realforge blender asset-plan --task \"…\"", "DRY RUN"]
      ]
    },
    assets: {
      eyebrow: "ASSET PIPELINES",
      title: "Connect briefs to reviewable production plans.",
      description: "Bounded references become untrusted pipeline context, never automatic production actions.",
      accent: "green",
      items: [
        ["Asset pipeline", "workflow", "Modeling, materials, collision, LOD, import, budgets, and risks.", "realforge asset pipeline --task \"…\"", "DRY RUN"],
        ["Unreal import", "package", "A safe /Game path and proposed import settings. Nothing is imported.", "realforge unreal import-plan --path …", "DRY RUN"],
        ["Validation checklist", "list-checks", "Scale, pivot, normals, materials, collision, LOD, and warnings.", "review required", "APPROVAL"]
      ]
    }
  });

  const settingsSections = Object.freeze([
    ["general", "General", "sliders-horizontal"],
    ["workspace", "Workspace", "folder"],
    ["provider", "Provider / Local Model", "cpu"],
    ["permissions", "Permissions", "lock-keyhole"],
    ["research", "Research / Network", "globe"],
    ["staff", "Staff Mode", "shield"],
    ["scheduler", "Scheduler", "calendar-clock"],
    ["benchmarks", "Benchmarks / Gates", "chart-no-axes-column"],
    ["creative", "Creative / Multimodal", "drama"],
    ["engine", "Engine Integrations", "box"],
    ["doctor", "Safety / Doctor", "stethoscope"]
  ].map(([id, label, icon]) => Object.freeze({ id, label, icon })));

  const settings = Object.freeze({
    general: [["Theme", "Forge Dark", "Near-black with restrained status accents"], ["Motion", "Reduced-safe", "Respects system reduced-motion preference"], ["Telemetry", "OFF", "No prototype data leaves this browser"]],
    workspace: [["Workspace root", "~/dev/RealLang", "Display-only mock value"], ["Artifact root", ".realforge/", "Gitignored metadata and reports"], ["Boundary", "PASS", "All writes remain workspace-bounded"]],
    provider: [["Provider", "mock", "Deterministic offline adapter"], ["Model", "deterministic", "No live local model required"], ["Multimodal", "MOCK ONLY", "No semantic recognition"]],
    permissions: [["Permission mode", "READONLY", "Prototype controls cannot change backend permissions"], ["Validation allowlist", "realc · pytest · git diff", "Arbitrary shell remains blocked"], ["Destructive actions", "REFUSED", "No auto-apply, auto-commit, or auto-merge"]],
    research: [["Network", "OFF", "Explicit HTTPS and domain allowlist required"], ["Allowed domains", "none", "Configured per request"], ["Research output", "UNTRUSTED", "Snapshots require review"]],
    staff: [["staff.enabled", "OFF", "Advanced controls hidden by default"], ["Apply mode", "MANUAL", "Confirmation and revalidation required"], ["Auto-commit", "REFUSED", "Unsupported by design"]],
    scheduler: [["scheduler.enabled", "OFF", "Staff-gated bounded jobs"], ["Runs per invocation", "1", "Hard cap remains enforced"], ["Autonomy", "BOUNDED", "Never applies or commits"]],
    benchmarks: [["Minimum score", "0.75", "Blocks improvement below gate"], ["Latest gate", "0.86 · PASS", "Static prototype state"], ["Suites", "smoke · planning · safety · generation", "Capability-domain scoring"]],
    creative: [["Binary image generation", "NOT IMPLEMENTED", "Prompt/spec planning only"], ["Vision recognition", "MOCK · 0.0", "Provider output remains untrusted"], ["Provenance", "ENABLED", "Prompt and reference hashes"]],
    engine: [["Unreal detection", "READ ONLY", "Filesystem profile only"], ["Blender", "PLANNING", "No process execution"], ["Project mutation", "REFUSED", "Approval-gated future work"]]
  });

  global.RealForgeMockData = Object.freeze({
    version: "2.7",
    navigation,
    capabilities,
    commands,
    studio,
    settingsSections,
    settings,
    updateStages: Object.freeze([
      ["Benchmark gate", "Minimum score must pass before a candidate exists."],
      ["Improvement candidate", "Read-only scan identifies one bounded candidate."],
      ["Patch proposal", "Untrusted unified diff remains review-only."],
      ["Isolated experiment", "Patch is validated outside the main workspace."],
      ["Update bundle", "Validated proposal becomes versioned metadata."],
      ["Review", "Staff reviews hashes, targets, validation mode, and risks."],
      ["Manual apply", "Explicit confirmation and revalidation are required."]
    ]),
    benchmarks: Object.freeze({
      overall: "0.86",
      gate: "0.75",
      tasks: "24",
      domains: Object.freeze(["code", "docs", "research", "creative", "image", "vision", "engine", "assets", "safety", "self-improvement"]),
      scores: Object.freeze([0.88, 0.79, 0.72, 0.81, 0.68, 0.55, 0.74, 0.77, 0.94, 0.70])
    })
  });
})(window);
