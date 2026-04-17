"use client";

import type { Card as CardType } from "@/lib/game/types";
import { isRed } from "@/lib/game/engine";

const RANK_LABELS: Record<number, string> = {
  1: "A",
  11: "J",
  12: "Q",
  13: "K",
};

const SUIT_GLYPHS: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

interface Props {
  card: CardType;
  selected?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

export function Card({ card, selected, onClick, compact }: Props) {
  if (!card.faceUp) {
    return (
      <div
        className={`card card-back ${selected ? "card-selected" : ""}`}
        onClick={onClick}
        role="button"
        aria-label="face-down card"
      />
    );
  }

  const label = RANK_LABELS[card.rank] ?? String(card.rank);
  const glyph = SUIT_GLYPHS[card.suit];
  const colorClass = isRed(card.suit) ? "card-red" : "card-black";

  return (
    <div
      className={`card ${colorClass} ${selected ? "card-selected" : ""}`}
      onClick={onClick}
      role="button"
      aria-label={`${label} of ${card.suit}`}
    >
      <div className="absolute left-1 top-0.5 leading-none">
        <div className="text-[0.8rem] font-bold sm:text-sm">{label}</div>
        <div className="text-[0.7rem] leading-none sm:text-xs">{glyph}</div>
      </div>
      {!compact && (
        <div className="flex h-full items-center justify-center text-2xl sm:text-3xl">
          {glyph}
        </div>
      )}
    </div>
  );
}
