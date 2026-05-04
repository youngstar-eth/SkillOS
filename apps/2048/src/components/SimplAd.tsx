import styles from "./SimplAd.module.css";

/**
 * Inline Simpl3 logomark — uses currentColor so the parent CSS drives fill.
 * Negative-space format: off-white plate with cutouts forming the mark.
 */
function SimplLogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      className={styles.mark}
      width={size}
      height={size}
      viewBox="0 0 1500 1500"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <g
        transform="translate(0,1500) scale(0.1,-0.1)"
        fill="currentColor"
        stroke="none"
      >
        <path d="M0 7500 l0 -7500 7500 0 7500 0 0 7500 0 7500 -7500 0 -7500 0 0 -7500z m11210 -235 l0 -2395 -3675 0 -3675 0 0 445 0 445 1813 2 1812 3 60 30 c115 56 198 164 241 310 24 82 24 267 0 350 -48 165 -157 286 -303 336 -55 19 -100 19 -1835 19 l-1778 0 0 1425 0 1425 3670 0 3670 0 0 -2395z" />
        <path d="M5020 8759 c-113 -64 -192 -163 -232 -290 -32 -105 -33 -301 -1 -404 55 -175 177 -283 363 -321 79 -16 245 -17 2430 -18 l2345 -1 58 29 c111 57 176 133 225 264 33 92 42 257 18 365 -45 200 -178 342 -367 392 -46 13 -401 15 -2419 15 l-2365 0 -55 -31z" />
        <path d="M8615 6793 c93 -244 101 -697 16 -970 l-19 -63 655 0 654 0 55 26 c69 32 154 114 186 179 54 107 63 151 63 300 0 127 -3 147 -27 214 -66 182 -197 289 -390 321 -38 6 -293 10 -632 10 -537 0 -568 -1 -561 -17z" />
      </g>
    </svg>
  );
}

/**
 * Top-of-page corporate banner surfacing the Skillbase ↔ Simpl3
 * parent-product relationship. Used in YC S26 demo recording.
 *
 * Editorial dark theme; mobile collapses tagline + AD label.
 */
export function SimplAd() {
  return (
    <aside className={styles.banner} aria-label="Simpl3 parent product banner">
      <span className={styles.adLabel}>AD</span>
      <div className={styles.content}>
        <SimplLogoMark size={28} />
        <span className={styles.brandName}>Simpl3</span>
        <span className={styles.tagline}>Simplifying Web3.</span>
      </div>
      <a
        href="https://simpl3.ai"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.link}
      >
        Visit simpl3.ai →
      </a>
    </aside>
  );
}

export default SimplAd;
