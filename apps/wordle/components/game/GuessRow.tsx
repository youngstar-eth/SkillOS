"use client";

import { LetterTile } from "./LetterTile";
import { WORD_LENGTH } from "@/lib/game/types";
import type { LetterState } from "@/lib/game/types";

type RowKind =
  | { kind: "submitted"; word: string; states: LetterState[] }
  | { kind: "current"; input: string; shaking: boolean }
  | { kind: "empty" };

export function GuessRow({ row }: { row: RowKind }) {
  const letters: string[] = [];
  const states: LetterState[] = [];
  let submitted = false;
  let shaking = false;

  if (row.kind === "submitted") {
    submitted = true;
    for (let i = 0; i < WORD_LENGTH; i++) {
      letters.push(row.word[i] ?? "");
      states.push(row.states[i] ?? "absent");
    }
  } else if (row.kind === "current") {
    shaking = row.shaking;
    for (let i = 0; i < WORD_LENGTH; i++) {
      const ch = row.input[i] ?? "";
      letters.push(ch);
      states.push(ch ? "tbd" : "empty");
    }
  } else {
    for (let i = 0; i < WORD_LENGTH; i++) {
      letters.push("");
      states.push("empty");
    }
  }

  return (
    <div
      className={`grid grid-cols-5 gap-[6px] ${shaking ? "row-shake" : ""}`}
      data-row={row.kind}
    >
      {letters.map((letter, i) => (
        <LetterTile
          key={i}
          letter={letter}
          state={states[i]}
          submitted={submitted}
          delayMs={submitted ? i * 100 : 0}
        />
      ))}
    </div>
  );
}
