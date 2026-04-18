"use client";

import { useEffect, useState } from "react";

/**
 * Dark/Light theme toggle — persists to localStorage under "sb.theme".
 * Mirrors the plain-HTML version in the design handoff; implemented as a
 * client component so it can read/write localStorage and toggle a
 * `data-theme` attribute on <html>.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Sync once on mount: read the saved theme and apply it to <html>.
  useEffect(() => {
    const saved = (typeof window !== "undefined" &&
      window.localStorage.getItem("sb.theme")) as "dark" | "light" | null;
    if (saved === "light") {
      document.documentElement.dataset.theme = "light";
      setTheme("light");
    } else {
      document.documentElement.dataset.theme = "dark";
      setTheme("dark");
    }
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("sb.theme", next);
    setTheme(next);
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
    >
      {theme === "light" ? "Light" : "Dark"}
    </button>
  );
}
