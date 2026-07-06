/**
 * Unreal Production Cockpit templates. Each template shapes the bounded prompt
 * sent to the user-configured local model so the answer comes back as a
 * reviewable, Unreal-specific work package (plan + Editor Python + manual steps
 * + validation) instead of generic text. Execution never happens here — the
 * shared approval-gated chat sandbox sends one bounded request, and every
 * result stays LOCAL UNTRUSTED until a human reviews it.
 */

export type UnrealTemplateId =
  | "gameplay"
  | "umg"
  | "level"
  | "assets"
  | "blueprint"
  | "cinematic"
  | "optimization"
  | "custom";

export interface UnrealTemplate {
  id: UnrealTemplateId;
  label: string;
  icon: string;
  blurb: string;
  placeholder: string;
  /** Role line for the model — senior specialist voice per discipline. */
  role: string;
  /** Template-specific output requirements appended to the shared structure. */
  focus: string[];
}

export const UNREAL_TEMPLATES: readonly UnrealTemplate[] = [
  {
    id: "gameplay",
    label: "Gameplay System",
    icon: "activity",
    blurb: "Input, actors, components, replication",
    placeholder:
      "Describe the gameplay system... e.g. a grappling hook: input action, cable component, physics swing, cooldown UI",
    role: "You are a senior Unreal Engine gameplay programmer.",
    focus: [
      "Cover input actions and bindings, actor/component architecture, and the Blueprint vs C++ boundary.",
      "Include replication and multiplayer notes if the system could ship multiplayer.",
      "End the architecture with a short test plan for the system."
    ]
  },
  {
    id: "umg",
    label: "UMG / UI",
    icon: "panel-right",
    blurb: "Widget tree, bindings, state flow",
    placeholder:
      "Describe the UI... e.g. an inventory screen: grid of item slots, drag-and-drop, tooltip, gamepad navigation",
    role: "You are a senior Unreal Engine UI engineer specialising in UMG.",
    focus: [
      "Describe the widget tree, widget classes, and styling approach.",
      "Cover bindings vs event-driven updates and the state flow between game data and widgets.",
      "Include accessibility, gamepad/keyboard navigation, and widget animation notes.",
      "End with an implementation checklist."
    ]
  },
  {
    id: "level",
    label: "Level Blockout",
    icon: "map",
    blurb: "World structure, placement, lighting",
    placeholder:
      "Describe the level... e.g. a vertical-slice canyon chase: three encounter zones, one vista, escape route",
    role: "You are a senior Unreal Engine level designer.",
    focus: [
      "Lay out world structure, actor placement plan, and World Outliner folders.",
      "Cover collision setup, a first lighting pass, and navmesh coverage notes.",
      "Prefer placeholder/blockout geometry; nothing final or destructive."
    ]
  },
  {
    id: "assets",
    label: "Asset Import",
    icon: "package",
    blurb: "Folders, naming, batch import",
    placeholder:
      "Describe the assets... e.g. 40 FBX props into /Game/Props with shared master material and instances",
    role: "You are a senior Unreal Engine technical artist who owns the content pipeline.",
    focus: [
      "Define the /Game folder structure, asset naming conventions, and a batch import plan.",
      "Provide a reviewable batch-import Editor Python script.",
      "Cover material setup and, where appropriate, Nanite and Lumen notes marked with # VERIFY: when version-sensitive.",
      "Include material and import validation in the checklist."
    ]
  },
  {
    id: "blueprint",
    label: "Blueprint Architecture",
    icon: "blocks",
    blurb: "Classes, events, interfaces, data",
    placeholder:
      "Describe the feature... e.g. a quest system: quest data assets, objective components, journal UI events",
    role: "You are a senior Unreal Engine architect who designs maintainable Blueprint systems.",
    focus: [
      "Name the Blueprint classes, components, events, and dispatchers involved.",
      "Use data assets, Blueprint interfaces, and function libraries where they reduce coupling.",
      "Include a debugging plan (print/log strategy, breakpoints, common failure points)."
    ]
  },
  {
    id: "cinematic",
    label: "Cinematic / Camera",
    icon: "eye",
    blurb: "Sequencer, shots, lighting, timing",
    placeholder:
      "Describe the cinematic... e.g. a 20s intro flyover: three shots, dawn lighting, ends on the player spawn",
    role: "You are a senior Unreal Engine cinematic designer working in Sequencer.",
    focus: [
      "Plan camera actors, a Sequencer track layout, and a shot list with timing.",
      "Cover cinematic lighting and any post-process needs.",
      "Include implementation notes for triggering and skipping the sequence."
    ]
  },
  {
    id: "optimization",
    label: "Optimization",
    icon: "gauge",
    blurb: "Profiling, risks, platform notes",
    placeholder:
      "Describe the target... e.g. open-world forest scene dropping to 40fps on console-class hardware",
    role: "You are a senior Unreal Engine performance engineer.",
    focus: [
      "Provide a profiling checklist (stat commands, Unreal Insights, GPU profiler) before any changes.",
      "Call out asset risks, tick risks, material complexity risks, and draw-call risks separately.",
      "Include platform-specific notes and a measure-first, change-second workflow."
    ]
  },
  {
    id: "custom",
    label: "Custom Task",
    icon: "terminal",
    blurb: "Anything Unreal, still structured",
    placeholder:
      "Describe any Unreal Engine task... the answer still arrives as a structured, reviewable work package",
    role: "You are a senior Unreal Engine technical artist and tools engineer.",
    focus: ["Choose the disciplines that fit the brief and keep the output practical and editor-ready."]
  }
];

export function getUnrealTemplate(id: UnrealTemplateId): UnrealTemplate {
  return UNREAL_TEMPLATES.find((template) => template.id === id) ?? UNREAL_TEMPLATES[UNREAL_TEMPLATES.length - 1];
}

// Shared constraints + response shape. Kept tight: template focus + 600-char
// brief + this skeleton must stay under the 2000-char sandbox prompt cap.
const SHARED_RULES = [
  "Target: Unreal Engine 5.x (stable APIs).",
  "Rules: no destructive operations; prefer a reviewable Editor Python script (import unreal) when scripting helps;",
  "mark version-sensitive API calls with # VERIFY:; explain manual editor steps for anything not scriptable;",
  "scripts are untrusted until a human reviews them.",
  "Respond with these labelled sections, each on its own line:",
  "SUMMARY: one or two sentences.",
  "ASSUMPTIONS: what you assumed about the project.",
  "ARCHITECTURE: the Unreal architecture for this task.",
  "ASSET & FOLDER PLAN: /Game paths and naming, if relevant.",
  "EDITOR PYTHON: reviewable script, only if useful.",
  "MANUAL EDITOR STEPS: numbered in-editor steps.",
  "VALIDATION CHECKLIST: what to verify afterward.",
  "RISKS & VERSION NOTES: risks plus any # VERIFY: items."
];

/** Compose the bounded, template-shaped prompt for one Unreal task. */
export function composeUnrealPrompt(templateId: UnrealTemplateId, input: string): string {
  const template = getUnrealTemplate(templateId);
  return [
    template.role,
    `Task type: ${template.label}.`,
    ...SHARED_RULES,
    "Template requirements:",
    ...template.focus,
    "",
    `Brief: ${input}`
  ].join("\n");
}
