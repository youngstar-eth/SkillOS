import type { CSSProperties, ElementType, ReactNode } from "react";

export interface SkillOSWordmarkProps {
  /** Render size in px (font-size). Default 20 — matches Header / Nav scale. */
  size?: number;
  /** Override wordmark color. Defaults to inherit (so parent `text-*` controls it). */
  color?: string;
  /** Element tag — default "span". */
  as?: ElementType;
  className?: string;
  /** Wordmark content. Defaults to "SkillOS"; pass e.g. "SkillOS · Wordle" for app suffixes. */
  children?: ReactNode;
}

/**
 * SkillOS canonical wordmark — pure typography, Inter weight 700,
 * letter-spacing -0.022em. Mirrors the apex `Wordmark` component
 * (skillbase-apex/components/skillos/ui/Wordmark.tsx) but applies the
 * typographic spec via inline style so it works without depending on
 * the `.skillos-page` CSS scope wrapper that apex uses internally.
 *
 * Use everywhere the brand name appears: app Headers, sponsor Nav/Footer.
 * Replaces the legacy pre-rebrand SVG monogram (which still rendered the
 * old SB pixel-art shape despite the file rename in the prior cutover).
 */
export function SkillOSWordmark({
  size = 20,
  color,
  as: Tag = "span",
  className,
  children = "SkillOS",
}: SkillOSWordmarkProps) {
  const style: CSSProperties = {
    fontFamily:
      "var(--font-inter-variable, 'Inter Variable', Inter, system-ui, sans-serif)",
    fontWeight: 700,
    letterSpacing: "-0.022em",
    lineHeight: 1,
    fontSize: size,
    ...(color ? { color } : null),
  };
  return (
    <Tag className={className} style={style}>
      {children}
    </Tag>
  );
}
