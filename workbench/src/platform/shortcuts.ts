/** Cross-platform keyboard shortcuts (Cmd on macOS, Ctrl on Windows). */

interface ShortcutHandlers {
  openPalette: (query?: string) => void;
  toggleSidebarOff: () => void;
}

export function bindGlobalShortcuts(handlers: ShortcutHandlers): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName || "");
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      handlers.openPalette();
      return;
    }
    if (event.key === "/" && !typing) {
      const paletteOpen = document.querySelector("dialog.command-dialog[open]");
      if (!paletteOpen) {
        event.preventDefault();
        handlers.openPalette("/");
      }
    }
    if (event.key === "Escape") {
      handlers.toggleSidebarOff();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}

export function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}
