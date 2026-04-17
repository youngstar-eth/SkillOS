"use client";

import { GuessRow } from "./GuessRow";
import { MAX_GUESSES } from "@/lib/game/types";
import type { Guess } from "@/lib/game/types";

interface BoardProps {
  guesses: Guess[];
  currentInput: string;
  isShaking: boolean;
  /** Hide the active row once the game is over (no more input possible). */
  gameOver: boolean;
}

export function Board({
  guesses,
  currentInput,
  isShaking,
  gameOver,
}: BoardProps) {
  const rows = [];
  for (let i = 0; i < MAX_GUESSES; i++) {
    if (i < guesses.length) {
      rows.push(
        <GuessRow
          key={i}
          row={{
            kind: "submitted",
            word: guesses[i].word,
            states: guesses[i].states,
          }}
        />,
      );
    } else if (i === guesses.length && !gameOver) {
      rows.push(
        <GuessRow
          key={i}
          row={{ kind: "current", input: currentInput, shaking: isShaking }}
        />,
      );
    } else {
      rows.push(<GuessRow key={i} row={{ kind: "empty" }} />);
    }
  }

  return (
    <div
      className="mx-auto grid w-full max-w-[330px] grid-rows-6 gap-[6px]"
      role="grid"
      aria-label="Wordle board"
    >
      {rows}
    </div>
  );
}
