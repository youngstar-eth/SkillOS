"use client";

import { useEffect, useState } from "react";

export const THEME_STORAGE_KEY = "skillbase-theme";

export type Theme = "light" | "dark";

function readDocumentTheme(): Theme {
  return document.documentElement.classList.contains("theme-light")
    ? "light"
    : "dark";
}

function applyTheme(next: Theme): void {
  const html = document.documentElement;
  html.classList.remove("theme-light", "theme-dark");
  html.classList.add(`theme-${next}`);
}

function persistTheme(next: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Safari private mode or embedded browsers: ignore.
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(readDocumentTheme());
    setMounted(true);
  }, []);

  const setTheme = (next: Theme) => {
    applyTheme(next);
    persistTheme(next);
    setThemeState(next);
  };

  const toggle = () => setTheme(theme === "light" ? "dark" : "light");

  return { theme, setTheme, toggle, mounted };
}
