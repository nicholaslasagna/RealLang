/** Detect whether the UI is hosted inside the Tauri desktop shell. */

export function isDesktopRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

export function isWebPreviewRuntime(): boolean {
  return !isDesktopRuntime();
}
