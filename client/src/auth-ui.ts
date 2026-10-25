import { DEFAULT_CONSTITUTION, GENDERS, REALMS, constitutionTierName, getRootCount, getRootGrade, type Gender } from "@game/shared";
import { api, type ApiResult, type CharacterEntry } from "./api";
import { fetchCatalog, getCatalog } from "./constitution-store";
import { vi } from "./locales/vi";

const root = () => document.getElementById("auth")!;

function errorText(code: string | undefined): string {
  return vi.errors[code ?? "unknown"] ?? vi.errors.unknown!;
}

/** What a banned player is told at login: until when (or for good) and the reason the admin gave. */
function banText(d: Record<string, unknown> | undefined): string {
  const until = d?.forever === true ? vi.ban.forever : typeof d?.until === "number" ? vi.ban.until(new Date(d.until).toLocaleString("vi-VN", { hour12: false })) : "";
  const reason = typeof d?.reason === "string" && d.reason ? vi.ban.reason(d.reason) : "";
  return `${vi.ban.title} ${until} ${reason}`.trim();
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function mount(card: HTMLElement): void {
  const host = root();
  host.replaceChildren(card);
  host.hidden = false;
}

export function hideAuth(): void {
  root().hidden = true;
  root().replaceChildren();
}

/** Login / register card. Resolves once the server accepted the credentials (session cookie set). */
export function showAuth(): Promise<void> {
  return new Promise((resolve) => {
    let registering = false;
    const render = () => {
      const email = el("input", { type: "email", placeholder: vi.email, autocomplete: "email", required: true });
      const password = el("input", {
        type: "password",
        placeholder: vi.password,
        autocomplete: registering ? "new-password" : "current-password",
        required: true,
      });
      const error = el("p", { className: "error" });
      const submit = el("button", { type: "submit", textContent: registering ? vi.register : vi.login });
      const toggle = el("button", {
        type: "button",
        className: "link",
        textContent: registering ? vi.switchToLogin : vi.switchToRegister,
      });
      toggle.onclick = () => {
        registering = !registering;
        render();
      };
      const form = el("form", {}, el("h1", { textContent: vi.title }), email, password, error, submit, toggle);
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        submit.disabled = true;
        error.textContent = "";
        const res: ApiResult<unknown> = registering
          ? await api.register(email.value, password.value)
          : await api.login(email.value, password.value);
        if (res.ok) return resolve();
        error.textContent = res.error === "banned" ? banText(res.details) : res.error === "reviewing" ? vi.errors.reviewing! : errorText(res.error);
        submit.disabled = false;
      };
      mount(el("div", { className: "card" }, form));
    };
    render();
  });
}

/** Character creation card. Resolves "created" once the character exists (the login plays it), or "back" when `canGoBack` and the player went back to the list. */
export function showCharacterCreate(canGoBack = false): Promise<"created" | "back"> {
  return new Promise((resolve) => {
    const name = el("input", { type: "text", placeholder: vi.characterName, maxLength: 16, required: true });
    const error = el("p", { className: "error" });
    const submit = el("button", { type: "submit", textContent: vi.createCharacter });
    const back = el("button", { type: "button", className: "link", textContent: vi.characterList.back });
    back.onclick = () => resolve("back");
    // Gender decides which gear the character can wear; it is chosen once, here.
    const genderSelect = el("select", {});
    for (const g of GENDERS) genderSelect.append(el("option", { value: g, textContent: vi.gender[g] ?? g }));
    const form = el(
      "form",
      {},
      el("h1", { textContent: vi.createCharacterTitle }),
      name,
      el("label", { className: "note", textContent: vi.gender.label }),
      genderSelect,
      el("p", { className: "note", textContent: vi.gender.note }),
      el("p", { className: "note", textContent: vi.linhCanNote }),
      error,
      submit,
      ...(canGoBack ? [back] : []),
    );
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      submit.disabled = true;
      error.textContent = "";
      const res = await api.createCharacter(name.value, genderSelect.value as Gender);
      if (res.ok && res.data?.character) {
        // Reveal the rolled spiritual root before entering the world.
        const c = res.data.character;
        await fetchCatalog(); // the constitution's name comes from the catalogue
        const enter = el("button", { type: "button", textContent: vi.enterWorld });
        enter.style.cssText = "margin-top:12px;width:100%";
        enter.onclick = () => resolve("created");
        mount(
          el(
            "div",
            { className: "card" },
            el("h1", { textContent: vi.rootRevealTitle }),
            el("p", { className: "note", textContent: vi.rootReveal(c.roots.map((r) => vi.roots[r] ?? r).join(", "), getRootCount(c.roots.length).nameVi, getRootGrade(c.rootGrade).nameVi) }),
            ...(c.constitution === DEFAULT_CONSTITUTION
              ? []
              : [el("p", { className: "note", textContent: vi.constitutionReveal(constitutionTierName(getCatalog(), c.constitution, c.constitutionTier)) })]),
            enter,
          ),
        );
        return;
      }
      if (res.error === "character_limit" && canGoBack) return resolve("back");
      error.textContent = errorText(res.error);
      submit.disabled = false;
    };
    mount(el("div", { className: "card" }, form));
  });
}

export type ListChoice = { kind: "enter"; id: string } | { kind: "create" } | { kind: "logout" };

const realmLine = (c: CharacterEntry) => `${REALMS[c.realm]?.nameVi ?? ""} ${c.stage}`.trim();

/**
 * The characters of the account: pick one to play, delete one (the player types its name again; the server deletes it softly), or make a new one while
 * there is room. Resolves with what the player chose; a deletion refreshes the list in place.
 */
export function showCharacterList(initial: CharacterEntry[], max: number): Promise<ListChoice> {
  return new Promise((resolve) => {
    let list = initial;
    const render = (note = "") => {
      const rows = list.map((c) => {
        const enter = el("button", { type: "button", className: "char-enter", textContent: vi.characterList.enter, disabled: c.reviewing });
        enter.onclick = () => resolve({ kind: "enter", id: c.id });
        const remove = el("button", { type: "button", className: "link", textContent: vi.characterList.remove, disabled: c.reviewing });
        remove.onclick = async () => {
          const typed = window.prompt(vi.characterList.removeAsk(c.name));
          if (typed === null) return;
          if (typed !== c.name) return render(vi.characterList.removeWrong);
          const res = await api.deleteCharacter(c.id, typed);
          if (!res.ok) return render(errorText(res.error));
          list = list.filter((x) => x.id !== c.id);
          // With none left the player starts from the creation card, as a new account does.
          if (list.length === 0) return resolve({ kind: "create" });
          render();
        };
        const info = el("div", { className: "char-info" }, el("b", { textContent: c.name }), el("span", { className: "note", textContent: `${vi.gender[c.gender] ?? c.gender} · ${realmLine(c)}${c.reviewing ? ` · ${vi.characterList.reviewing}` : ""}` }));
        return el("div", { className: "char-row" }, info, enter, remove);
      });
      const create = el("button", { type: "button", textContent: vi.characterList.create });
      create.onclick = () => resolve({ kind: "create" });
      create.hidden = list.length >= max;
      const logout = el("button", { type: "button", className: "link", textContent: vi.logout });
      logout.onclick = () => resolve({ kind: "logout" });
      mount(
        el(
          "div",
          { className: "card" },
          el("h1", { textContent: vi.characterList.title }),
          el("p", { className: "note", textContent: vi.characterList.count(list.length, max) }),
          ...rows,
          el("p", { className: "error", textContent: note }),
          ...(list.length >= max ? [el("p", { className: "note", textContent: vi.characterList.full })] : [create]),
          logout,
        ),
      );
    };
    render();
  });
}
