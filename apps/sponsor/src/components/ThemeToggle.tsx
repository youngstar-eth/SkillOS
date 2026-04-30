"use client";

import { useTheme } from "../lib/useTheme";

export function ThemeToggle() {
  const { theme, toggle, mounted } = useTheme();
  const next = theme === "light" ? "dark" : "light";
  const glyph = theme === "light" ? "☾" : "☀";

  if (!mounted) {
    return <span aria-hidden className="inline-block h-10 w-10" />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="apex-btn apex-btn-icon"
    >
      <span aria-hidden className="text-base leading-none">
        {glyph}
      </span>
    </button>
  );
}
