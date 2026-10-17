import { vi } from "./locales/vi";

export interface VitalsUi {
  set(hp: number, maxHp: number): void;
  setLinhThach(balance: number): void;
}

/** Own HP bar under the status line. */
export function initVitals(): VitalsUi {
  const root = document.getElementById("vitals")!;
  const text = document.getElementById("vitals-text")!;
  const fill = document.getElementById("vitals-fill")!;
  const wallet = document.getElementById("wallet-text")!;
  return {
    set(hp, maxHp) {
      root.hidden = false;
      text.textContent = `${vi.combat.hp}: ${hp} / ${maxHp}`;
      fill.style.width = `${maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0}%`;
    },
    setLinhThach(balance) {
      wallet.textContent = `${vi.economy.linhThach}: ${balance.toLocaleString("vi-VN")}`;
    },
  };
}
