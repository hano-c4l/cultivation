/** Shared building blocks of the admin screens: DOM helper, API calls, the list view (search, sort, paging) and the detail shell. */

type Child = Node | string | null | undefined | false;
type Props = Record<string, string | boolean | ((e: Event) => void)>;

/** Small element builder: `h("a", { href: "/x", class: "card" }, "text", child)`. Props starting with "on" are event handlers. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false) node.setAttribute(key, value);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

export interface ApiResult<T> {
  status: number;
  data: T;
}

/** Calls the game API with the session cookie. Never throws on an HTTP error: look at `status`. */
export async function api<T = Record<string, unknown>>(path: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
  });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as T };
}

/** Moves to another admin address without a page load; the router in main.ts listens for it. */
export function navigate(path: string): void {
  history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleString("vi-VN", { hour12: false });
}

export interface Column<T> {
  key: string;
  label: string;
  /** Sortable columns send their key as `sort`; the server decides which keys it accepts. */
  sortable?: boolean;
  render: (row: T) => Child;
}

export interface ListQuery {
  q: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  size: number;
  /** Values of the extra filters (by key), plus the fixed parameters of the screen. */
  extra: Record<string, string>;
}

/** A filter control next to the search box; its value goes into `ListQuery.extra[key]`. */
export interface FilterDef {
  key: string;
  label: string;
  kind: "select" | "date" | "text";
  /** For "select": [value, label] pairs. */
  options?: Array<[string, string]>;
  initial?: string;
}

export interface ListOptions<T> {
  columns: Column<T>[];
  defaultSort: { key: string; dir: "asc" | "desc" };
  searchPlaceholder?: string;
  /** Fetches one page; the server does the searching, sorting and paging. */
  fetchPage: (query: ListQuery) => Promise<{ rows: T[]; total: number; summary?: unknown } | null>;
  /** Extra filters, drawn in the toolbar; changing one reloads from page 1. */
  filters?: FilterDef[];
  /** Parameters sent with every request that the user cannot change here (for example one character). */
  fixedParams?: Record<string, string>;
  /** Draws a block above the table from `summary` of the latest page (totals, breakdowns...). */
  renderSummary?: (summary: unknown) => Child;
  /** Where a click on a row goes (the detail screen). */
  rowHref?: (row: T) => string;
  /** Extra buttons next to the search box (for example "Thêm"). */
  toolbar?: Child[];
}

const PAGE_SIZES = [10, 20, 50, 100];

/** A list screen: search box, sortable headers, a pager. The same view serves every catalogue, only the columns and `fetchPage` change. */
export function listView<T>(opts: ListOptions<T>): HTMLElement {
  const state: ListQuery = { q: "", sort: opts.defaultSort.key, dir: opts.defaultSort.dir, page: 1, size: 20, extra: { ...(opts.fixedParams ?? {}) } };
  for (const f of opts.filters ?? []) if (f.initial) state.extra[f.key] = f.initial;
  const summaryBox = h("div");
  const filterControls = (opts.filters ?? []).map((f) => {
    const control =
      f.kind === "select"
        ? h("select", null, ...(f.options ?? []).map(([v, label]) => h("option", { value: v }, label)))
        : h("input", { type: f.kind === "date" ? "date" : "text", maxlength: "40" });
    control.value = f.initial ?? "";
    const apply = () => {
      if (control.value) state.extra[f.key] = control.value;
      else delete state.extra[f.key];
      state.page = 1;
      void load();
    };
    control.addEventListener(f.kind === "text" ? "input" : "change", () => {
      if (f.kind !== "text") return apply();
      window.clearTimeout(filterTimer);
      filterTimer = window.setTimeout(apply, 300);
    });
    return h("label", { class: "filter" }, f.label, control);
  });
  let filterTimer = 0;
  const search = h("input", { type: "search", placeholder: opts.searchPlaceholder ?? "Tìm kiếm...", maxlength: "64" });
  const head = h("thead");
  const body = h("tbody");
  const info = h("span", { class: "muted" });
  const prev = h("button", { type: "button" }, "‹ Trước");
  const next = h("button", { type: "button" }, "Sau ›");
  const sizeSel = h("select", null, ...PAGE_SIZES.map((n) => h("option", { value: String(n) }, `${n} dòng`)));
  sizeSel.value = String(state.size);
  const status = h("div", { class: "muted" });
  let total = 0;
  let token = 0;

  const renderHead = () => {
    head.replaceChildren(
      h(
        "tr",
        null,
        ...opts.columns.map((c) =>
          h(
            "th",
            {
              class: c.sortable ? "sortable" : "",
              onclick: () => {
                if (!c.sortable) return;
                state.dir = state.sort === c.key && state.dir === "desc" ? "asc" : "desc";
                state.sort = c.key;
                state.page = 1;
                void load();
              },
            },
            c.label + (state.sort === c.key ? (state.dir === "asc" ? " ▲" : " ▼") : ""),
          ),
        ),
      ),
    );
  };

  const load = async () => {
    const mine = ++token;
    renderHead();
    status.textContent = "Đang tải...";
    const res = await opts.fetchPage({ ...state });
    if (mine !== token) return; // a newer request replaced this one
    if (!res) {
      status.textContent = "Không tải được dữ liệu.";
      status.className = "err";
      return;
    }
    summaryBox.replaceChildren(...(opts.renderSummary && res.summary !== undefined ? [opts.renderSummary(res.summary)].filter((n): n is Node | string => Boolean(n)) : []));
    status.textContent = res.rows.length === 0 ? "Không có dòng nào." : "";
    status.className = "muted";
    total = res.total;
    body.replaceChildren(
      ...res.rows.map((row) => {
        const href = opts.rowHref?.(row);
        const tr = h("tr", href ? { class: "link", onclick: () => navigate(href) } : null, ...opts.columns.map((c) => h("td", null, c.render(row))));
        return tr;
      }),
    );
    const pages = Math.max(1, Math.ceil(total / state.size));
    info.textContent = `Trang ${state.page}/${pages} · ${total} dòng`;
    prev.disabled = state.page <= 1;
    next.disabled = state.page >= pages;
  };

  let timer = 0;
  search.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      state.q = search.value.trim();
      state.page = 1;
      void load();
    }, 300);
  });
  prev.addEventListener("click", () => {
    state.page = Math.max(1, state.page - 1);
    void load();
  });
  next.addEventListener("click", () => {
    state.page += 1;
    void load();
  });
  sizeSel.addEventListener("change", () => {
    state.size = Number(sizeSel.value);
    state.page = 1;
    void load();
  });

  void load();
  return h(
    "div",
    null,
    h("div", { class: "toolbar" }, search, ...filterControls, ...(opts.toolbar ?? [])),
    summaryBox,
    h("div", { class: "table-wrap" }, h("table", null, head, body)),
    status,
    h("div", { class: "pager" }, prev, next, info, sizeSel),
  );
}

export interface DetailField {
  label: string;
  value: Child;
}

/** A detail screen: a back link, a title, label/value rows, optional extra blocks and action buttons. */
export function detailShell(opts: { backHref: string; backLabel: string; title: string; fields: DetailField[]; blocks?: Child[]; actions?: Child[] }): HTMLElement {
  return h(
    "div",
    { class: "detail" },
    h("a", { href: opts.backHref }, `‹ ${opts.backLabel}`),
    h("h2", null, opts.title),
    h("dl", { class: "fields" }, ...opts.fields.flatMap((f) => [h("dt", null, f.label), h("dd", null, f.value)])),
    ...(opts.blocks ?? []),
    opts.actions && opts.actions.length ? h("div", { class: "actions" }, ...opts.actions) : null,
  );
}

/** JSON in a scrollable block, "—" when there is nothing. */
export function jsonBlock(value: unknown): HTMLElement | string {
  return value === null || value === undefined ? "—" : h("pre", null, JSON.stringify(value, null, 2));
}
