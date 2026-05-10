// Deliberate index page. Visiting the root domain of the orchestrator should
// return a small explainer so an operator who hits the URL by accident knows
// what this project is. No links, no UI dependency — just static text.

export default function Page() {
  return (
    <main style={{ fontFamily: "monospace", padding: "2rem", maxWidth: "60ch" }}>
      <h1>SkillOS Orchestrator</h1>
      <p>
        This deployment hosts SkillOS&apos;s scheduled cron jobs. There is no
        public UI here. Cron triggers are project-bound to Vercel&apos;s
        scheduler and gated by <code>CRON_SECRET</code>.
      </p>
      <p>
        Source: <code>apps/orchestrator/</code> in the{" "}
        <code>skillos</code> monorepo.
      </p>
    </main>
  );
}
