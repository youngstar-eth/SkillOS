import Link from "next/link";
import { ModeChooser } from "@skillos/ui";

export default function HomePage() {
  return (
    <>
      <ModeChooser gameName="2048" />
      <nav className="pb-10 text-center text-xs text-neutral-500">
        <Link
          href="/leaderboard"
          className="underline-offset-4 hover:text-skill hover:underline"
        >
          Leaderboard
        </Link>
        <span className="px-2 text-neutral-700">·</span>
        <Link
          href="/challenge"
          className="underline-offset-4 hover:text-skill hover:underline"
        >
          Challenge &amp; Verify
        </Link>
      </nav>
    </>
  );
}
