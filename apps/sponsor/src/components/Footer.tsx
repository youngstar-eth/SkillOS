import Link from "next/link";
import { SkillOSWordmark } from "@skillos/ui";

const YEAR = new Date().getFullYear();

export function Footer() {
  return (
    <footer className="apex-footer">
      <div className="mx-auto max-w-5xl px-4 md:px-6">
        <div className="row">
          <Link
            href="/"
            aria-label="SkillOS Sponsor home"
            className="brand-block"
          >
            <SkillOSWordmark size={16}>SkillOS</SkillOSWordmark>
            <span className="meta">· Sponsor</span>
          </Link>
          <div className="links">
            <Link href="/dashboard">My sponsorships</Link>
            <a
              href="https://skillos.games"
              target="_blank"
              rel="noopener noreferrer"
            >
              skillos.games
            </a>
          </div>
          <div className="meta">© {YEAR} Simpl3 Inc.</div>
        </div>
      </div>
    </footer>
  );
}
