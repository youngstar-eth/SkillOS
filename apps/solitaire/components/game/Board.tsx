"use client";

import type { PileRef, SolitaireState } from "@/lib/game/types";
import { SinglePile, TableauPile } from "./Pile";

interface Props {
  state: SolitaireState;
  selection: { pileRef: PileRef; fromIdx: number } | null;
  onPileClick: (pileRef: PileRef, cardIdx?: number) => void;
  onStockClick: () => void;
}

export function Board({ state, selection, onPileClick, onStockClick }: Props) {
  const wasteTop = state.waste[state.waste.length - 1];
  const stockTop = state.stock[state.stock.length - 1];

  const stockRef: PileRef = { type: "stock", index: 0 };
  const wasteRef: PileRef = { type: "waste", index: 0 };

  const wasteSelected =
    selection?.pileRef.type === "waste" &&
    selection.pileRef.index === wasteRef.index;

  return (
    <div className="board-felt p-2 sm:p-3">
      {/* Top row: stock, waste, gap, 4 foundations */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {/* Stock */}
        <div onClick={onStockClick} className="cursor-pointer">
          {stockTop ? (
            <div className="card card-back" aria-label="stock" />
          ) : (
            <div className="pile-empty flex items-center justify-center text-[10px] uppercase tracking-widest text-muted">
              ↻
            </div>
          )}
        </div>

        {/* Waste */}
        <div>
          <SinglePile
            card={wasteTop}
            pileRef={wasteRef}
            selected={wasteSelected}
            onClick={() => onPileClick(wasteRef)}
            emptyLabel=""
          />
        </div>

        {/* Spacer */}
        <div />

        {/* Foundations */}
        {([0, 1, 2, 3] as const).map((i) => {
          const ref: PileRef = { type: "foundation", index: i };
          const top = state.foundation[i][state.foundation[i].length - 1];
          return (
            <div key={i}>
              <SinglePile
                card={top}
                pileRef={ref}
                variant="foundation"
                onClick={() => onPileClick(ref)}
                emptyLabel={["♥", "♦", "♣", "♠"][i]}
              />
            </div>
          );
        })}
      </div>

      {/* Tableau row */}
      <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-2">
        {state.tableau.map((col, i) => {
          const ref: PileRef = { type: "tableau", index: i };
          return (
            <TableauPile
              key={i}
              cards={col}
              pileRef={ref}
              selection={selection}
              onCardClick={(r, idx) => onPileClick(r, idx)}
              onEmptyClick={(r) => onPileClick(r)}
            />
          );
        })}
      </div>
    </div>
  );
}
