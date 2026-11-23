import type { HotkeyPlatform } from "@tanstack/react-hotkeys";

export const platforms: HotkeyPlatform[] = ["mac", "windows", "linux"];

/**
 * Sets `<html data-platform>` before first paint, so CSS can show the
 * shortcut labels for the user's platform in server-rendered HTML that
 * carries all of them (see `Hotkey` and global.css). Mirrors TanStack
 * Hotkeys' `detectPlatform`, so it agrees with what `useHotkey` matches.
 */
export const platformScript = `(() => {
  const platform = (navigator.platform || "").toLowerCase();
  const agent = navigator.userAgent.toLowerCase();
  document.documentElement.dataset.platform =
    platform.includes("mac") || agent.includes("mac") ? "mac"
    : platform.includes("win") || agent.includes("win") ? "windows"
    : "linux";
})()`;
