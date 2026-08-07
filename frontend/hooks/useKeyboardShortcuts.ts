"use client";

import { useEffect, useState, useCallback } from "react";

type ShortcutHandler = (e: KeyboardEvent) => void;

interface Shortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  handler: ShortcutHandler;
  preventDefault?: boolean;
}

const shortcuts: Shortcut[] = [];

export function registerShortcut(shortcut: Shortcut) {
  shortcuts.push(shortcut);
  return () => {
    const index = shortcuts.indexOf(shortcut);
    if (index > -1) shortcuts.splice(index, 1);
  };
}

export function useKeyboardShortcuts(mapping: Record<string, ShortcutHandler>) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditing = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;

      for (const [keyCombo, handler] of Object.entries(mapping)) {
        const parts = keyCombo.toLowerCase().split("+");
        const ctrl = parts.includes("ctrl");
        const meta = parts.includes("meta");
        const shift = parts.includes("shift");
        const key = parts.find((p) => !["ctrl", "meta", "shift"].includes(p));

        const match =
          key &&
          e.key &&
          e.key.toLowerCase() === key.toLowerCase() &&
          (!ctrl || e.ctrlKey) &&
          (!meta || e.metaKey) &&
          (!shift || e.shiftKey);

        if (match) {
          if (isEditing) continue;
          e.preventDefault();
          handler(e);
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mapping]);
}

export function useGlobalShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const match =
          e.key &&
          e.key.toLowerCase() === shortcut.key.toLowerCase() &&
          (!shortcut.ctrlKey || e.ctrlKey) &&
          (!shortcut.metaKey || e.metaKey) &&
          (!shortcut.shiftKey || e.shiftKey);

        if (match) {
          if (shortcut.preventDefault) e.preventDefault();
          shortcut.handler(e);
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
