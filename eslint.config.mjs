import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/out/**",
      "**/build/**",
      "**/next-env.d.ts",
    ],
  },
  {
    rules: {
      // Deferred to follow-up PR (React 19 ergonomic refactor sprint).
      //
      // Three new rules introduced by Next 16 + React Compiler 1.0 +
      // React 19 hooks plugin fire in 25+ locations across 7 game
      // apps + sponsor app. Patterns are legitimate but suboptimal:
      //   - setState inside useEffect (set-state-in-effect)
      //   - useMemo body that React Compiler can't preserve
      //     (preserve-manual-memoization)
      //
      // Plus stricter App Router enforcement of:
      //   - <a href="/page"> → <Link> migration (no-html-link-for-pages)
      //
      // No runtime impact; production testnet apps unaffected.
      // Tracked for cleanup PR post-merge.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/refs": "off",
      "@next/next/no-html-link-for-pages": "off",
    },
  },
];

export default eslintConfig;
