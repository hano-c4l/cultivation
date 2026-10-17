import { CURRENCIES, EMPTY_WALLET, type Currency, type Wallet } from "@game/shared";
import { vi } from "./locales/vi";

export interface VitalsUi {
  set(hp: number, maxHp: number): void;
  /** Replaces all balances (welcome). */
  setWallet(wallet: Wallet): void;
  /** Updates one balance (a gain or spend while playing). */
  setBalance(currency: Currency, balance: number): void;
}

/** Own HP bar under the status line. */
export function initVitals(): VitalsUi {
  const root = document.getElementById("vitals")!;
  const text = document.getElementById("vitals-text")!;
  const fill = document.getElementById("vitals-fill")!;
  const walletBox = document.getElementById("wallet")!;
  const balances: Wallet = { ...EMPTY_WALLET };
  const render = () => {
    walletBox.hidden = false;
    walletBox.replaceChildren(
      ...CURRENCIES.map((c) => {
        const row = document.createElement("div");
        const name = document.createElement("span");
        name.textContent = vi.economy.currency[c];
        const value = document.createElement("b");
        value.textContent = balances[c].toLocaleString("vi-VN");
        row.append(name, value);
        return row;
      }),
    );
  };
  return {
    set(hp, maxHp) {
      root.hidden = false;
      text.textContent = `${vi.combat.hp}: ${hp} / ${maxHp}`;
      fill.style.width = `${maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0}%`;
    },
    setWallet(wallet) {
      Object.assign(balances, wallet);
      render();
    },
    setBalance(currency, balance) {
      balances[currency] = balance;
      render();
    },
  };
}
