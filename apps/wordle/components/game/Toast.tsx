"use client";

/**
 * Simple transient notice pinned to the top-center. The parent owns the
 * mount/unmount lifecycle via a setTimeout; this component is purely visual.
 */
export function Toast({ message }: { message: string }) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed left-1/2 top-4 z-40 -translate-x-1/2 rounded bg-fg px-4 py-2 text-sm font-semibold text-bg shadow-lg"
    >
      {message}
    </div>
  );
}
