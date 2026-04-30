import Link from "next/link";
import { SkillbaseMark } from "@skillbase/ui";

const YEAR = new Date().getFullYear();

export function Footer() {
  return (
    <footer className="apex-footer">
      <div className="mx-auto max-w-5xl px-4 md:px-6">
        <div className="row">
          <Link
            href="/"
            aria-label="Skillbase Sponsor home"
            className="brand-block"
          >
            <SkillbaseMark size={28} className="pixel-mark" />
            <span className="word">Skillbase</span>
            <span className="meta">· Sponsor</span>
          </Link>
          <div className="links">
            <Link href="/dashboard">My sponsorships</Link>
            <a
              href="https://skillbase.games"
              target="_blank"
              rel="noopener noreferrer"
            >
              skillbase.games
            </a>
          </div>
          <div className="meta">© {YEAR} Simpl3 Inc.</div>
        </div>
      </div>
    </footer>
  );
}
