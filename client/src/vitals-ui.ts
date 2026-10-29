import { CURRENCIES, EMPTY_WALLET, type Currency, type Wallet } from "@game/shared";
import { uiIcon, type IconShape } from "./icons";
import { vi } from "./locales/vi";

/** The picture that stands for each currency (its name is the tooltip). */
const CURRENCY_ICON: Readonly<Record<Currency, IconShape>> = { linh_thach: "stone", cong_hien: "merit", tien_ngoc: "immortal" };

export interface VitalsUi {
  /** HP now. It then goes on by the rate last given (`setRates`): the server sends HP once a second while it regenerates, but none while the character is in town. */
  set(hp: number, maxHp: number): void;
  /** MP now; it then regenerates by `perSec` (a fraction of max) per second (`regenInMs` is not used any more: nothing waits for a hit to be forgotten). */
  setMp(mp: number, maxMp: number, regenInMs: number, perSec: number): void;
  /** HP and MP regenerated per second now (points): meditating or not, with the gear. */
  setRates(hpPerS: number, mpPerS: number): void;
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
  let mpState = { mp: 0, max: 0, regenAt: 0, rate: 0 };
  const mpNow = (): number => {
    const { mp, max, regenAt, rate } = mpState;
    if (mp >= max) return max;
    const elapsed = Date.now() - regenAt;
    return elapsed <= 0 || rate <= 0 ? mp : Math.min(max, mp + Math.floor((elapsed / 1000) * rate));
  };
  const drawMp = () => {
    const v = mpNow();
    mpText.textContent = `${vi.skills.mpLabel}: ${v} / ${mpState.max}`;
    mpFill.style.width = `${mpState.max > 0 ? Math.max(0, Math.min(100, (v / mpState.max) * 100)) : 0}%`;
  };
  setInterval(drawMp, 500);
  let hpState: { hp: number; max: number; regenAt: number; rate: number } | null = null;
  const hpNow = (): number => {
    if (!hpState) return 0;
    const { hp, max, regenAt, rate } = hpState;
    const elapsed = Date.now() - regenAt;
    return hp >= max || elapsed <= 0 || rate <= 0 ? hp : Math.min(max, hp + Math.floor((elapsed / 1000) * rate));
  };
  const drawHp = () => {
    if (!hpState) return;
    const { max } = hpState;
    const v = hpNow();
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
    set(hp, maxHp) {
      root.hidden = false;
      hpState = { hp, max: maxHp, regenAt: Date.now(), rate: hpState?.rate ?? 0 };
      text.textContent = `${vi.combat.hp}: ${hp} / ${maxHp}`;
      fill.style.width = `${maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0}%`;
    },
    setMp(mp, maxMp, _regenInMs, perSec) {
      mpState = { mp, max: maxMp, regenAt: Date.now(), rate: maxMp * perSec };
      drawMp();
    },
    setRates(hpPerS, mpPerS) {
      // What has regenerated at the old rate stays; the new rate counts from now.
      if (hpState) hpState = { hp: hpNow(), max: hpState.max, regenAt: Date.now(), rate: hpPerS };
      mpState = { mp: mpNow(), max: mpState.max, regenAt: Date.now(), rate: mpPerS };
      drawHp();
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
