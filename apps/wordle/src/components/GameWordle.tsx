"use client";

/**
 * Wordle duel game component.
 *
 * Props contract matches Game2048 so the duel/[id] page can swap in with
 * a single import change:
 *   seed:           bytes32 hex from the match row (determines the target word)
 *   onGameOver(n):  called once with the final score when game ends
 *   onScoreChange:  called during play — we always emit 0 here (the board
 *                   itself communicates progress; the ScoreCard would only
 *                   show a noisy "potential score" if we pushed live values)
 *   frozen:         external kill-switch (submit in flight)
 *
 * Scoring mirrors the legacy engine:
 *   Guess bonus: (7 − guessCount) × 1000  → 6000 at 1 guess, 1000 at 6
 *   Speed bonus: max(0, floor((60000 − ms)/100)), capped at 6000
 *   Loss: floored to 1 so the shared backend's score > 0 check accepts it
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  calculateScore,
  evaluateGuess,
  isValidGuess,
  pickAnswerFromSeed,
  updateKeyboardStates,
} from "@/lib/wordle/engine";
import {
  MAX_GUESSES,
  WORD_LENGTH,
  type GameStatus,
  type Guess,
  type LetterState,
} from "@/lib/wordle/types";

type Props = {
  seed: string;
  onGameOver: (score: number) => void;
  onScoreChange?: (score: number) => void;
  frozen?: boolean;
};

type State = {
  answer: string;
  guesses: Guess[];
  currentInput: string;
  status: GameStatus;
  keyboardStates: Record<string, LetterState>;
  startedAt: number;
  shakeCounter: number;
  lastGuessAt: number; // timestamp of last submitted guess (drives flip)
};

type Action =
  | { type: "reset"; seed: string }
  | { type: "type"; letter: string }
  | { type: "backspace" }
  | { type: "submit"; guess: Guess }
  | { type: "shake" }
  | { type: "finalize"; status: "won" | "lost" };

const initialFor = (seed: string): State => ({
  answer: pickAnswerFromSeed(seed),
  guesses: [],
  currentInput: "",
  status: "playing",
  keyboardStates: {},
  startedAt: Date.now(),
  shakeCounter: 0,
  lastGuessAt: 0,
});

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return initialFor(action.seed);
    case "type":
      if (state.status !== "playing") return state;
      if (state.currentInput.length >= WORD_LENGTH) return state;
      return { ...state, currentInput: state.currentInput + action.letter };
    case "backspace":
      if (state.status !== "playing") return state;
      return { ...state, currentInput: state.currentInput.slice(0, -1) };
    case "submit":
      return {
        ...state,
        guesses: [...state.guesses, action.guess],
        keyboardStates: updateKeyboardStates(state.keyboardStates, action.guess),
        currentInput: "",
        lastGuessAt: Date.now(),
      };
    case "shake":
      return { ...state, shakeCounter: state.shakeCounter + 1 };
    case "finalize":
      return { ...state, status: action.status };
  }
}

const LETTER = /^[a-z]$/;
const REVEAL_DURATION_MS = WORD_LENGTH * 100 + 500; // last tile flip + buffer
const TOAST_DURATION_MS = 1800;

export function GameWordle({
  seed,
  onGameOver,
  onScoreChange,
  frozen,
}: Props) {
  const [state, dispatch] = useReducer(reduce, seed, initialFor);
  const [toast, setToast] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const overFired = useRef(false);

  // Reset on seed change
  useEffect(() => {
    dispatch({ type: "reset", seed });
    overFired.current = false;
    setRevealing(false);
    setToast(null);
  }, [seed]);

  // Live score emission — always 0 for Wordle (see file header comment).
  useEffect(() => {
    onScoreChange?.(0);
  }, [onScoreChange]);

  // Fire onGameOver once
  useEffect(() => {
    if (state.status === "playing" || overFired.current) return;
    overFired.current = true;
    const won = state.status === "won";
    const durationMs = Date.now() - state.startedAt;
    const raw = calculateScore(state.guesses, won, durationMs);
    const finalScore = Math.max(1, raw);
    onGameOver(finalScore);
  }, [state.status, state.guesses, state.startedAt, onGameOver]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  const submitGuess = useCallback(() => {
    if (frozen || revealing || state.status !== "playing") return;
    const input = state.currentInput;
    if (input.length !== WORD_LENGTH) {
      showToast("Not enough letters");
      dispatch({ type: "shake" });
      return;
    }
    if (!isValidGuess(input)) {
      showToast("Not in word list");
      dispatch({ type: "shake" });
      return;
    }
    const states = evaluateGuess(input, state.answer);
    const guess: Guess = { word: input, states };
    dispatch({ type: "submit", guess });

    const won = input === state.answer;
    const lost = !won && state.guesses.length + 1 >= MAX_GUESSES;
    if (won || lost) {
      setRevealing(true);
      window.setTimeout(() => {
        dispatch({ type: "finalize", status: won ? "won" : "lost" });
        setRevealing(false);
      }, REVEAL_DURATION_MS);
    }
  }, [
    frozen,
    revealing,
    state.status,
    state.currentInput,
    state.answer,
    state.guesses.length,
    showToast,
  ]);

  const handleKey = useCallback(
    (key: string) => {
      if (frozen || revealing || state.status !== "playing") return;
      if (key === "Enter") {
        submitGuess();
      } else if (key === "Backspace") {
        dispatch({ type: "backspace" });
      } else {
        const k = key.toLowerCase();
        if (LETTER.test(k)) dispatch({ type: "type", letter: k });
      }
    },
    [frozen, revealing, state.status, submitGuess],
  );

  // Physical keyboard
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "Enter" || e.key === "Backspace") {
        e.preventDefault();
        handleKey(e.key);
      } else if (e.key.length === 1 && LETTER.test(e.key.toLowerCase())) {
        handleKey(e.key);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [handleKey]);

  const gameOver = state.status !== "playing";
  const remainingGuesses = MAX_GUESSES - state.guesses.length;

  return (
    <div className="flex w-full max-w-[420px] flex-col items-center gap-4">
      {/* Guess counter — replaces the ScoreCard progress signal */}
      <div className="flex w-full items-center justify-between text-xs uppercase tracking-wider text-neutral-500">
        <span>
          Guess {Math.min(state.guesses.length + 1, MAX_GUESSES)} /{" "}
          {MAX_GUESSES}
        </span>
        {!gameOver && (
          <span>
            {remainingGuesses} {remainingGuesses === 1 ? "try" : "tries"} left
          </span>
        )}
        {state.status === "won" && (
          <span className="text-emerald-400">Solved ✓</span>
        )}
        {state.status === "lost" && (
          <span className="text-red-400">
            Answer: <span className="uppercase">{state.answer}</span>
          </span>
        )}
      </div>

      <Board
        guesses={state.guesses}
        currentInput={state.currentInput}
        shakeCounter={state.shakeCounter}
        gameOver={gameOver}
      />

      <Keyboard
        states={state.keyboardStates}
        disabled={frozen || revealing || gameOver}
        onPress={handleKey}
      />

      {/* Toast — Not a word / Not enough letters */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 top-20 z-40 -translate-x-1/2 rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-black shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Board ─────────────────────────────────────────────────────────────────

function Board({
  guesses,
  currentInput,
  shakeCounter,
  gameOver,
}: {
  guesses: Guess[];
  currentInput: string;
  shakeCounter: number;
  gameOver: boolean;
}) {
  return (
    <div
      className="mx-auto grid w-full max-w-[330px] grid-rows-6 gap-[6px]"
      role="grid"
      aria-label="Wordle board"
    >
      {Array.from({ length: MAX_GUESSES }).map((_, i) => {
        if (i < guesses.length) {
          return (
            <SubmittedRow
              key={`s-${i}`}
              word={guesses[i].word}
              states={guesses[i].states}
            />
          );
        }
        if (i === guesses.length && !gameOver) {
          return (
            <CurrentRow
              key={`c-${i}-${shakeCounter}`}
              input={currentInput}
              shakeCounter={shakeCounter}
            />
          );
        }
        return <EmptyRow key={`e-${i}`} />;
      })}
    </div>
  );
}

function SubmittedRow({ word, states }: { word: string; states: LetterState[] }) {
  return (
    <div className="grid grid-cols-5 gap-[6px]">
      {Array.from({ length: WORD_LENGTH }).map((_, i) => (
        <Tile
          key={i}
          letter={word[i] ?? ""}
          state={states[i] ?? "absent"}
          submitted
          delayMs={i * 100}
        />
      ))}
    </div>
  );
}

function CurrentRow({
  input,
  shakeCounter,
}: {
  input: string;
  shakeCounter: number;
}) {
  return (
    <div
      className={
        "grid grid-cols-5 gap-[6px] " +
        (shakeCounter > 0 ? "wordle-row-shake" : "")
      }
      key={shakeCounter}
    >
      {Array.from({ length: WORD_LENGTH }).map((_, i) => {
        const ch = input[i] ?? "";
        return (
          <Tile
            key={i}
            letter={ch}
            state={ch ? "tbd" : "empty"}
            submitted={false}
            pop={ch.length > 0 && i === input.length - 1}
          />
        );
      })}
    </div>
  );
}

function EmptyRow() {
  return (
    <div className="grid grid-cols-5 gap-[6px]">
      {Array.from({ length: WORD_LENGTH }).map((_, i) => (
        <Tile key={i} letter="" state="empty" submitted={false} />
      ))}
    </div>
  );
}

// ─── LetterTile ────────────────────────────────────────────────────────────

const TILE_STYLES: Record<LetterState, string> = {
  correct: "bg-emerald-600 text-white border-emerald-600",
  present: "bg-amber-500 text-white border-amber-500",
  absent: "bg-neutral-700 text-white border-neutral-700",
  empty: "bg-bg border-border text-neutral-100",
  tbd: "bg-bg border-neutral-500 text-neutral-100",
};

function Tile({
  letter,
  state,
  submitted,
  delayMs = 0,
  pop = false,
}: {
  letter: string;
  state: LetterState;
  submitted: boolean;
  delayMs?: number;
  pop?: boolean;
}) {
  const cls = TILE_STYLES[state];
  const animClass =
    submitted && state !== "empty" && state !== "tbd"
      ? "wordle-tile-flip"
      : pop
        ? "wordle-tile-pop"
        : "";
  return (
    <div
      className={
        "flex aspect-square w-full select-none items-center justify-center border-2 text-2xl font-bold uppercase " +
        cls +
        " " +
        animClass
      }
      style={submitted ? { animationDelay: `${delayMs}ms` } : undefined}
      aria-label={letter ? `${letter} ${state}` : "empty"}
    >
      {letter}
    </div>
  );
}

// ─── Keyboard ──────────────────────────────────────────────────────────────

const ROW_1 = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"];
const ROW_2 = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
const ROW_3 = ["Enter", "z", "x", "c", "v", "b", "n", "m", "Backspace"];

const KEY_STYLES: Record<LetterState, string> = {
  correct: "bg-emerald-600 text-white",
  present: "bg-amber-500 text-white",
  absent: "bg-neutral-700 text-neutral-300",
  empty: "bg-bg-elev text-neutral-100 hover:bg-bg-elev2",
  tbd: "bg-bg-elev text-neutral-100 hover:bg-bg-elev2",
};

function Keyboard({
  states,
  disabled,
  onPress,
}: {
  states: Record<string, LetterState>;
  disabled: boolean;
  onPress: (key: string) => void;
}) {
  const renderKey = (key: string) => {
    const isAction = key === "Enter" || key === "Backspace";
    const state = states[key.toLowerCase()] ?? "empty";
    const style = isAction
      ? "bg-bg-elev text-neutral-100 hover:bg-bg-elev2"
      : KEY_STYLES[state];
    const label =
      key === "Backspace" ? "⌫" : key === "Enter" ? "Enter" : key.toUpperCase();
    return (
      <button
        key={key}
        type="button"
        onClick={() => onPress(key)}
        disabled={disabled}
        className={
          "flex h-12 min-w-[28px] flex-1 select-none items-center justify-center rounded-md text-sm font-semibold uppercase tracking-tight transition-colors disabled:opacity-50 " +
          style +
          (isAction ? " flex-[1.5] text-xs" : "")
        }
        data-key={key}
        aria-label={key}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-[6px]">
      <div className="flex gap-[4px]">{ROW_1.map(renderKey)}</div>
      <div className="flex gap-[4px] px-[5%]">{ROW_2.map(renderKey)}</div>
      <div className="flex gap-[4px]">{ROW_3.map(renderKey)}</div>
    </div>
  );
}
