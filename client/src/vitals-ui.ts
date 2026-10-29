import { CURRENCIES, EMPTY_WALLET, type Currency, type Wallet } from "@game/shared";
import { uiIcon, type IconShape } from "./icons";
import { vi } from "./locales/vi";

/** The picture that stands for each currency (its name is the tooltip). */
const CURRENCY_ICON: Readonly<Record<Currency, IconShape>> = { linh_thach: "stone", cong_hien: "merit", tien_ngoc: "immortal" };

export interface VitalsUi {
  /** HP now. With `regen`, it keeps regenerating by itself (the server sends no HP updates while the character is in town). */
  set(hp: number, maxHp: number, regen?: { inMs: number; perSec: number }): void;
  /** MP now; it then regenerates by `perSec` (a fraction of max) per second once `regenInMs` has passed. */
  setMp(mp: number, maxMp: number, regenInMs: number, perSec: number): void;
  /** MP at this moment (the stored value plus the regeneration since). */
  getMp(): number;
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
  // The status line wraps to several lines on a phone; the HP bar sits right under whatever height it really has.
  const hud = document.getElementById("hud");
  if (hud && "ResizeObserver" in window) {
    new ResizeObserver(() => document.documentElement.style.setProperty("--hud-bottom", `${hud.offsetTop + hud.offsetHeight}px`)).observe(hud);
  }
  const mpText = document.getElementById("vitals-mp-text")!;
  const mpFill = document.getElementById("vitals-mp-fill")!;
  let mpState = { mp: 0, max: 0, regenAt: 0, perSec: 0.02 };
  const mpNow = (): number => {
    const { mp, max, regenAt, perSec } = mpState;
    if (mp >= max) return max;
    const elapsed = Date.now() - regenAt;
    return elapsed <= 0 ? mp : Math.min(max, mp + Math.floor((elapsed / 1000) * Math.max(1, max * perSec)));
  };
  const drawMp = () => {
    const v = mpNow();
    mpText.textContent = `${vi.skills.mpLabel}: ${v} / ${mpState.max}`;
    mpFill.style.width = `${mpState.max > 0 ? Math.max(0, Math.min(100, (v / mpState.max) * 100)) : 0}%`;
  };
  setInterval(drawMp, 500);
  let hpState: { hp: number; max: number; regenAt: number; perSec: number } | null = null;
  const drawHp = () => {
    if (!hpState) return;
    const { hp, max, regenAt, perSec } = hpState;
    const elapsed = Date.now() - regenAt;
    const v = hp >= max || elapsed <= 0 ? hp : Math.min(max, hp + Math.floor((elapsed / 1000) * Math.max(1, max * perSec)));
    text.textContent = `${vi.combat.hp}: ${v} / ${max}`;
    fill.style.width = `${max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0}%`;
  };
  setInterval(drawHp, 500);
  const balances: Wallet = { ...EMPTY_WALLET };
  const render = () => {
    walletBox.hidden = false;
    walletBox.replaceChildren(
      ...CURRENCIES.map((c) => {
        const row = document.createElement("div");
        row.title = vi.economy.currency[c]; // the name moved to the tooltip: the icon stands for it
        row.setAttribute("aria-label", vi.economy.currency[c]);
        const value = document.createElement("b");
        value.textContent = balances[c].toLocaleString("vi-VN");
        row.append(uiIcon(CURRENCY_ICON[c]), value);
        return row;
      }),
    );
  };
  return {
    set(hp, maxHp, regen) {
      root.hidden = false;
      // A later plain update (the server drives HP in a fight) turns the local regeneration off.
      hpState = regen ? { hp, max: maxHp, regenAt: Date.now() + regen.inMs, perSec: regen.perSec } : null;
      text.textContent = `${vi.combat.hp}: ${hp} / ${maxHp}`;
      fill.style.width = `${maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0}%`;
    },
    setMp(mp, maxMp, regenInMs, perSec) {
      mpState = { mp, max: maxMp, regenAt: Date.now() + regenInMs, perSec };
      drawMp();
    },
    getMp: mpNow,
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
