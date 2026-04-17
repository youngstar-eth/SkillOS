"use client";

import { getUpgradeCost } from "@/lib/game/engine";
import { formatNumber, formatRate } from "@/lib/game/format";
import type { ClickerState, Upgrade } from "@/lib/game/types";

interface UpgradePanelProps {
  state: ClickerState;
  onBuy: (upgradeId: string) => void;
}

export function UpgradePanel({ state, onBuy }: UpgradePanelProps) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="display text-h3 text-fg">Grow your forest</h3>
      <div className="flex flex-col gap-2">
        {state.upgrades.map((u) => (
          <UpgradeCard
            key={u.id}
            upgrade={u}
            leaves={state.leaves}
            onBuy={onBuy}
            disabled={state.status !== "playing"}
          />
        ))}
      </div>
    </div>
  );
}

function UpgradeCard({
  upgrade,
  leaves,
  onBuy,
  disabled,
}: {
  upgrade: Upgrade;
  leaves: number;
  onBuy: (id: string) => void;
  disabled: boolean;
}) {
  const cost = getUpgradeCost(upgrade);
  const maxed =
    upgrade.maxOwned !== undefined && upgrade.owned >= upgrade.maxOwned;
  const affordable = !maxed && leaves >= cost;
  const locked = disabled || maxed || !affordable;

  return (
    <button
      type="button"
      onClick={() => onBuy(upgrade.id)}
      disabled={locked}
      className={[
        "upgrade-card",
        affordable && !disabled ? "affordable" : "",
        locked ? "locked" : "",
      ].join(" ")}
    >
      <span className="text-3xl" aria-hidden>
        {upgrade.icon}
      </span>
      <div className="flex flex-1 flex-col">
        <div className="flex items-baseline justify-between">
          <span className="font-semibold text-fg">{upgrade.name}</span>
          <span className="text-xs text-muted tabular">×{upgrade.owned}</span>
        </div>
        <p className="text-[11px] leading-tight text-muted">{upgrade.description}</p>
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span className="text-accent-deep">
            {upgrade.clickMultiplier
              ? `×${upgrade.clickMultiplier} leaves/click`
              : `+${formatRate(upgrade.leavesPerSecond)} each`}
          </span>
          {maxed ? (
            <span className="font-semibold text-bark">MAX</span>
          ) : (
            <span
              className={`tabular font-bold ${affordable ? "text-leaf" : "text-muted"}`}
            >
              🍃 {formatNumber(cost)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
