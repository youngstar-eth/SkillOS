"use client";

import type { Card as CardType, PileRef } from "@/lib/game/types";
import { Card } from "./Card";

interface TableauProps {
  cards: CardType[];
  pileRef: PileRef;
  selection: { pileRef: PileRef; fromIdx: number } | null;
  onCardClick: (pileRef: PileRef, cardIdx: number) => void;
  onEmptyClick: (pileRef: PileRef) => void;
}

export function TableauPile({
  cards,
  pileRef,
  selection,
  onCardClick,
  onEmptyClick,
}: TableauProps) {
  if (cards.length === 0) {
    return (
      <div
        className="pile-empty"
        onClick={() => onEmptyClick(pileRef)}
        role="button"
        aria-label="empty tableau"
      />
    );
  }

  const isSelectedPile =
    selection?.pileRef.type === "tableau" &&
    selection.pileRef.index === pileRef.index;

  return (
    <div className="flex flex-col">
      {cards.map((card, i) => {
        const selected = isSelectedPile && i >= selection.fromIdx;
        // Each subsequent card overlaps upward so only a top strip is visible
        const overlap = i === 0 ? "" : "-mt-[72%]";
        return (
          <div key={card.id} className={`relative ${overlap}`} style={{ zIndex: i + 1 }}>
            <Card
              card={card}
              selected={selected}
              compact={i < cards.length - 1}
              onClick={() => onCardClick(pileRef, i)}
            />
          </div>
        );
      })}
    </div>
  );
}

interface SingleProps {
  card: CardType | undefined;
  pileRef: PileRef;
  selected?: boolean;
  onClick: (pileRef: PileRef) => void;
  emptyLabel?: string;
  variant?: "default" | "foundation";
}

export function SinglePile({
  card,
  pileRef,
  selected,
  onClick,
  emptyLabel,
  variant,
}: SingleProps) {
  if (!card) {
    return (
      <div
        className={`pile-empty ${variant === "foundation" ? "pile-foundation" : ""} flex items-center justify-center text-[10px] uppercase tracking-widest text-muted`}
        onClick={() => onClick(pileRef)}
        role="button"
        aria-label={emptyLabel ?? "empty"}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <Card card={card} selected={selected} onClick={() => onClick(pileRef)} />
  );
}
