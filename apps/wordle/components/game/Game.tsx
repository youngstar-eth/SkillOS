"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import sdk from "@farcaster/frame-sdk";
import type { Hex } from "viem";
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { Board } from "./Board";
import { Keyboard } from "./Keyboard";
import { Toast } from "./Toast";
import { GameOver, type SubmitState } from "./GameOver";
import {
  AICoachButton,
  AutoSubmitScore,
  CreateChallengeButton,
  PayoutCelebration,
} from "@mas/shared/components";
import {
  ARCADE_POOL_ABI,
  ARCADE_POOL_ADDRESS,
} from "@mas/shared/contracts";
import {
  calculateScore,
  evaluateGuess,
  isValidGuess,
  maxLetterHint,
  pickAnswer,
  updateKeyboardStates,
} from "@/lib/game/engine";
import {
  MAX_GUESSES,
  WORD_LENGTH,
  type GameStatus,
  type Guess,
  type LetterState,
} from "@/lib/game/types";

export const WORDLE_TOURNAMENT_ID = 21n;

export interface GameProps {
  /** When present, overrides the deterministic daily word. */
  dailyWord?: string;
}

/** Delay before opening GameOver modal — lets the final-row flip finish. */
const REVEAL_DURATION_MS = WORD_LENGTH * 100 + 500;
const TOAST_DURATION_MS = 1800;
const SHAKE_DURATION_MS = 400;

const LETTER = /^[a-z]$/;

export function Game({ dailyWord }: GameProps = {}) {
  const { address, isConnected } = useAccount();

  // ----- Game state ---------------------------------------------------------
  // Answer is picked on client mount to avoid SSR hydration mismatch (pickAnswer
  // is deterministic but we also don't want to leak it in page source).
  const [answer, setAnswer] = useState("");
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [status, setStatus] = useState<GameStatus>("playing");
  const [keyboardStates, setKeyboardStates] = useState<
    Record<string, LetterState>
  >({});
  const [startedAt, setStartedAt] = useState(0);

  // UI-only ephemeral state
  const [toast, setToast] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [gameOverVisible, setGameOverVisible] = useState(false);
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

  // Refs so a single keyboard listener always sees fresh state.
  const stateRef = useRef({
    answer,
    guesses,
    currentInput,
    status,
    keyboardStates,
    revealing,
  });
  useEffect(() => {
    stateRef.current = {
      answer,
      guesses,
      currentInput,
      status,
      keyboardStates,
      revealing,
    };
  }, [answer, guesses, currentInput, status, keyboardStates, revealing]);

  // Seed on mount. Daily mode overrides the deterministic pick.
  useEffect(() => {
    const word = dailyWord ? dailyWord.toLowerCase() : pickAnswer(Number(WORDLE_TOURNAMENT_ID));
    setAnswer(word);
    setStartedAt(Date.now());
  }, [dailyWord]);

  // ----- Action helpers -----------------------------------------------------
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  const triggerShake = useCallback(() => {
    setShaking(true);
    window.setTimeout(() => setShaking(false), SHAKE_DURATION_MS);
  }, []);

  const submitGuess = useCallback(() => {
    const {
      answer: ans,
      guesses: gs,
      currentInput: input,
      keyboardStates: kb,
      status: st,
      revealing: rev,
    } = stateRef.current;
    if (st !== "playing" || rev) return;

    if (input.length !== WORD_LENGTH) {
      showToast("Not enough letters");
      triggerShake();
      return;
    }
    if (!isValidGuess(input)) {
      showToast("Not in word list");
      triggerShake();
      return;
    }

    const states = evaluateGuess(input, ans);
    const guess: Guess = { word: input, states };
    const newGuesses = [...gs, guess];
    const newKb = updateKeyboardStates(kb, guess);
    const won = input === ans;
    const lost = !won && newGuesses.length >= MAX_GUESSES;

    setGuesses(newGuesses);
    setKeyboardStates(newKb);
    setCurrentInput("");

    if (won || lost) {
      setRevealing(true);
      window.setTimeout(() => {
        setStatus(won ? "won" : "lost");
        setGameOverVisible(true);
        setRevealing(false);
      }, REVEAL_DURATION_MS);
    }
  }, [showToast, triggerShake]);

  const handleKey = useCallback(
    (key: string) => {
      const { currentInput: input, status: st, revealing: rev } =
        stateRef.current;
      if (st !== "playing" || rev) return;
      if (key === "Enter") {
        submitGuess();
      } else if (key === "Backspace") {
        setCurrentInput(input.slice(0, -1));
      } else {
        const k = key.toLowerCase();
        if (LETTER.test(k) && input.length < WORD_LENGTH) {
          setCurrentInput(input + k);
        }
      }
    },
    [submitGuess],
  );

  // Physical keyboard
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      // Ignore when user is typing in a form (none in our UI, but defensive).
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

  const restart = useCallback(() => {
    // Answer is pinned to the tournament; replay keeps it the same. The
    // contract's nonce-used check prevents double-submit anyway.
    setGuesses([]);
    setCurrentInput("");
    setStatus("playing");
    setKeyboardStates({});
    setStartedAt(Date.now());
    setGameOverVisible(false);
    setSubmit({ status: "idle" });
  }, []);

  // ----- Submit score (2048 pattern, preserved) ----------------------------
  const writeW = useWriteContract();
  const writeRcpt = useWaitForTransactionReceipt({ hash: writeW.data });

  useEffect(() => {
    if (writeW.error) {
      setSubmit({ status: "error", message: writeW.error.message });
    }
  }, [writeW.error]);

  useEffect(() => {
    if (writeW.data && submit.status === "writing") {
      setSubmit((prev) =>
        prev.status === "writing"
          ? {
              status: "confirming",
              sessionId: prev.sessionId,
              nonce: prev.nonce,
              signature: prev.signature,
              txHash: writeW.data as Hex,
            }
          : prev,
      );
    }
  }, [writeW.data, submit.status]);

  useEffect(() => {
    if (writeRcpt.isSuccess && writeRcpt.data && submit.status === "confirming") {
      setSubmit((prev) =>
        prev.status === "confirming"
          ? {
              status: "done",
              txHash: prev.txHash,
              sessionId: prev.sessionId,
            }
          : prev,
      );
    }
    if (writeRcpt.isError) {
      setSubmit({
        status: "error",
        message: writeRcpt.error?.message ?? "tx failed",
      });
    }
  }, [
    writeRcpt.isSuccess,
    writeRcpt.isError,
    writeRcpt.data,
    writeRcpt.error,
    submit.status,
  ]);

  const won = status === "won";
  const score = calculateScore(guesses, won, Date.now() - startedAt);

  const submitScore = useCallback(async () => {
    if (submit.status === "signed") {
      const stashed = submit;
      setSubmit({ ...stashed, status: "writing" });
      writeW.writeContract({
        address: ARCADE_POOL_ADDRESS,
        abi: ARCADE_POOL_ABI,
        functionName: "submitScore",
        args: [
          WORDLE_TOURNAMENT_ID,
          BigInt(score),
          BigInt(stashed.nonce),
          stashed.signature,
        ],
      });
      return;
    }

    setSubmit({ status: "signing" });
    try {
      const token = await sdk.quickAuth.getToken();
      const res = await fetch("/api/score", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tournamentId: Number(WORDLE_TOURNAMENT_ID),
          score,
          maxTile: maxLetterHint(guesses),
          moves: guesses.length,
          durationMs: Date.now() - startedAt,
          won,
          // `grid` column on game_sessions accepts arbitrary JSON; we stash the
          // round's full state so the leaderboard UI can replay it later.
          grid: { guesses, answer, tournamentId: Number(WORDLE_TOURNAMENT_ID) },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

      const signed: SubmitState = {
        status: "signed",
        sessionId: data.sessionId,
        nonce: data.nonce,
        signature: data.signature as Hex,
      };
      setSubmit(signed);

      // Auto-advance to writing so the wallet prompt pops right after signing.
      setSubmit({ ...signed, status: "writing" });
      writeW.writeContract({
        address: ARCADE_POOL_ADDRESS,
        abi: ARCADE_POOL_ABI,
        functionName: "submitScore",
        args: [
          WORDLE_TOURNAMENT_ID,
          BigInt(score),
          BigInt(data.nonce),
          data.signature as Hex,
        ],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSubmit({ status: "error", message });
    }
  }, [submit, score, guesses, answer, startedAt, won, writeW]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          Tournament #{WORDLE_TOURNAMENT_ID.toString()} · {guesses.length}/{MAX_GUESSES}
        </span>
        <button
          type="button"
          onClick={restart}
          className="rounded-sm border border-border bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted hover:border-fg/40 hover:text-fg"
          aria-label="Restart game"
        >
          New
        </button>
      </div>

      <Board
        guesses={guesses}
        currentInput={currentInput}
        isShaking={shaking}
        gameOver={status !== "playing"}
      />

      <Keyboard
        states={keyboardStates}
        disabled={status !== "playing" || revealing}
        onPress={handleKey}
      />

      {toast && <Toast message={toast} />}

      {gameOverVisible && (
        <GameOver
          won={won}
          answer={answer}
          guessCount={guesses.length}
          score={score}
          canSubmit={isConnected && !!address}
          onRestart={restart}
          onSubmit={submitScore}
          submit={submit}
          aiCoachSlot={
            <>
              <AutoSubmitScore
                userAddress={address}
                gameSlug="wordle"
                score={score}
                tournamentId={Number(WORDLE_TOURNAMENT_ID)}
                gameData={{
                  word: answer.toUpperCase(),
                  guesses: guesses.length,
                  won,
                }}
              />
              <PayoutCelebration
                userAddress={address}
                gameSlug="wordle"
                score={score}
                enabled={
                  process.env.NEXT_PUBLIC_INSTANT_PAYOUT === "1"
                }
              />
              <CreateChallengeButton
                gameSlug="wordle"
                score={score}
                enabled={process.env.NEXT_PUBLIC_CHALLENGES === "1"}
              />
              {address && guesses.length > 0 ? (
                <AICoachButton
                  gameSlug="wordle"
                  userAddress={address}
                  score={score}
                  tournamentId={Number(WORDLE_TOURNAMENT_ID)}
                  stats={{
                    word: answer.toUpperCase(),
                    guesses: guesses.length,
                    timeSeconds: Math.round((Date.now() - startedAt) / 1000),
                    startWord: guesses[0]?.word.toUpperCase() ?? "",
                    guessHistory: guesses.map((g) => ({
                      word: g.word.toUpperCase(),
                      states: g.states,
                    })),
                    won,
                  }}
                />
              ) : null}
            </>
          }
        />
      )}
    </div>
  );
}
