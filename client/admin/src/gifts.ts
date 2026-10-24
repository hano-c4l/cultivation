import { api, formatTime, h, listView } from "./kit";

/** "Gửi quà" (PHASE3 3d): a mail with currency and items to chosen characters or to the whole server, and the history of sends. */

interface Meta {
  items: Array<{ id: string; nameVi: string; maxStack: number }>;
  characters: number;
  limits: { subject: number; body: number; recipients: number; itemKinds: number };
}

interface Recipient {
  id: string;
  name: string;
}

interface Batch {
  id: string;
  createdAt: number;
  adminEmail: string;
  subject: string;
  audience: "list" | "all";
  recipients: number;
  attachments: { linh_thach?: number; cong_hien?: number; tien_ngoc?: number; items: Array<{ type: string; qty: number }> };
  expiresAt: number | null;
  claimed: number;
}

const ERRORS: Record<string, string> = {
  invalid_batch: "Mã lần gửi không hợp lệ, hãy tải lại trang.",
  invalid_text: "Tiêu đề không được trống (tối đa 80 ký tự), nội dung tối đa 1000 ký tự.",
  invalid_gift: "Phần quà không hợp lệ: cần ít nhất một khoản; số tiền từ 1 đến 1 tỉ; vật phẩm hợp lệ, không trùng, không quá số xếp chồng.",
  invalid_audience: "Danh sách người nhận không hợp lệ (1 đến 1000 nhân vật).",
  invalid_expiry: "Số ngày hết hạn phải là số nguyên từ 1 đến 3650.",
  no_recipients: "Không có nhân vật nào nhận được thư (đã bị xóa?).",
};

/** A random id for one send, made once per form render so that a second click cannot send twice. */
function newBatchId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("");
}

function describe(a: Batch["attachments"]): string {
  return [a.linh_thach ? `${a.linh_thach} Linh Thạch` : "", a.cong_hien ? `${a.cong_hien} Cống Hiến` : "", a.tien_ngoc ? `${a.tien_ngoc} Tiên Ngọc` : "", ...a.items.map((i) => `${i.type} × ${i.qty}`)].filter(Boolean).join(", ");
}

export function giftsPage(): HTMLElement {
  const root = h("div", { class: "detail wide" });
  void (async () => {
    const res = await api<Meta>("/api/admin/gifts/meta");
    if (res.status !== 200) {
      root.replaceChildren(h("p", { class: "err" }, "Không tải được dữ liệu."));
      return;
    }
    const hist = historyView();
    root.replaceChildren(sendForm(res.data, hist.reload), h("h2", null, "Lịch sử gửi quà"), hist.node);
  })();
  return root;
}

function sendForm(meta: Meta, onSent: () => void): HTMLElement {
  let batchId = newBatchId();
  const picked = new Map<string, Recipient>();
  const msg = h("div", { class: "msg muted" });

  // Audience.
  const radioList = h("input", { type: "radio", name: "aud", value: "list", checked: true });
  const radioAll = h("input", { type: "radio", name: "aud", value: "all" });
  const chips = h("div", { class: "chips" });
  const pickedInfo = h("div", { class: "muted" });
  const renderPicked = () => {
    chips.replaceChildren(
      ...[...picked.values()].map((r) => {
        const x = h("button", { type: "button", title: "Bỏ khỏi danh sách" }, `${r.name} ✕`);
        x.addEventListener("click", () => {
          picked.delete(r.id);
          renderPicked();
        });
        return x;
      }),
    );
    pickedInfo.textContent = `Đã chọn ${picked.size}/${meta.limits.recipients} nhân vật.`;
  };
  const addPicked = (r: Recipient): boolean => {
    if (picked.has(r.id)) return true;
    if (picked.size >= meta.limits.recipients) {
      msg.textContent = `Tối đa ${meta.limits.recipients} nhân vật mỗi lần; muốn gửi nhiều hơn thì chọn "Toàn bộ server".`;
      msg.className = "msg err";
      return false;
    }
    picked.set(r.id, r);
    return true;
  };

  const search = h("input", { type: "search", placeholder: "Tìm theo email hoặc đạo hiệu (từ 2 ký tự)...", maxlength: "64" });
  const found = h("div", { class: "found" });
  let timer = 0;
  search.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const q = search.value.trim();
      if (q.length < 2) return found.replaceChildren();
      const r = await api<{ accounts?: Array<{ email: string; characters: Array<{ id: string; name: string }> }> }>(`/api/admin/lookup?q=${encodeURIComponent(q)}`);
      const rows = (r.data.accounts ?? []).flatMap((a) => a.characters.map((c) => ({ ...c, email: a.email })));
      found.replaceChildren(
        ...(rows.length === 0
          ? [h("span", { class: "muted" }, "Không thấy nhân vật nào.")]
          : rows.map((c) => {
              const add = h("button", { type: "button" }, `+ ${c.name} (${c.email})`);
              add.addEventListener("click", () => {
                if (addPicked(c)) renderPicked();
              });
              return add;
            })),
      );
    }, 300);
  });

  const paste = h("textarea", { rows: "3", placeholder: "Hoặc dán danh sách đạo hiệu, mỗi dòng một tên (khớp đúng tên; chỉ A-Z không phân biệt hoa thường)" });
  const addPaste = h("button", { type: "button" }, "Thêm từ danh sách dán");
  addPaste.addEventListener("click", async () => {
    const names = paste.value.split(/\r?\n/).map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    const r = await api<{ found?: Recipient[]; missing?: string[] }>("/api/admin/gifts/resolve", { method: "POST", body: { names } });
    if (r.status !== 200) {
      msg.textContent = "Không tra được danh sách tên.";
      msg.className = "msg err";
      return;
    }
    for (const c of r.data.found ?? []) if (!addPicked(c)) break;
    renderPicked();
    const missing = r.data.missing ?? [];
    paste.value = missing.join("\n");
    msg.textContent = missing.length ? `Không tìm thấy ${missing.length} tên (còn lại trong ô dán): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "..." : ""}` : "Đã thêm tất cả.";
    msg.className = missing.length ? "msg err" : "msg ok";
  });
  const listBox = h("div", null, search, found, h("div", { class: "toolbar" }, paste, addPaste), chips, pickedInfo);
  const allBox = h(
    "div",
    { class: "muted" },
    `Toàn bộ server là ${meta.characters} nhân vật có lúc bấm Gửi (ảnh chụp tại thời điểm đó). Nhân vật tạo sau đó sẽ KHÔNG nhận thư này. Mỗi người nhận tốn khoảng 3 dòng ghi D1 (gói Free: 100.000 dòng mỗi ngày, dùng chung preview và production).`,
  );
  const syncAudience = () => {
    listBox.hidden = !radioList.checked;
    allBox.hidden = !radioAll.checked;
  };
  radioList.addEventListener("change", syncAudience);
  radioAll.addEventListener("change", syncAudience);

  // Text and attachments.
  const subject = h("input", { type: "text", maxlength: String(meta.limits.subject), placeholder: "Tiêu đề" });
  const body = h("textarea", { rows: "4", maxlength: String(meta.limits.body), placeholder: "Nội dung (xuống dòng được giữ nguyên)" });
  const money = {
    linh_thach: h("input", { type: "number", min: "0", step: "1", placeholder: "0" }),
    cong_hien: h("input", { type: "number", min: "0", step: "1", placeholder: "0" }),
    tien_ngoc: h("input", { type: "number", min: "0", step: "1", placeholder: "0" }),
  };
  const itemRows = h("div");
  const addItemRow = () => {
    if (itemRows.children.length >= meta.limits.itemKinds) return;
    const sel = h("select", null, ...meta.items.map((i) => h("option", { value: i.id }, `${i.nameVi} (${i.id})`)));
    const qty = h("input", { type: "number", min: "1", step: "1", value: "1" });
    const rm = h("button", { type: "button" }, "✕");
    const row = h("div", { class: "toolbar" }, sel, qty, rm);
    rm.addEventListener("click", () => row.remove());
    itemRows.append(row);
  };
  const addItem = h("button", { type: "button" }, "+ Thêm vật phẩm");
  addItem.addEventListener("click", addItemRow);
  const days = h("input", { type: "number", min: "1", max: "3650", step: "1", placeholder: "để trống = không hết hạn" });
  const send = h("button", { type: "button", class: "primary" }, "Gửi quà");

  send.addEventListener("click", async () => {
    const fail = (t: string) => {
      msg.textContent = t;
      msg.className = "msg err";
    };
    const gift: Record<string, unknown> = {};
    for (const [k, input] of Object.entries(money)) {
      const v = input.value.trim() === "" ? 0 : Number(input.value);
      if (!Number.isInteger(v) || v < 0) return fail("Số tiền phải là số nguyên không âm.");
      if (v > 0) gift[k] = v;
    }
    const items = [...itemRows.children].map((row) => ({ type: (row.querySelector("select") as HTMLSelectElement).value, qty: Number((row.querySelector("input") as HTMLInputElement).value) }));
    if (new Set(items.map((i) => i.type)).size !== items.length) return fail("Mỗi vật phẩm chỉ chọn một lần.");
    gift.items = items;
    if (subject.value.trim() === "") return fail("Nhập tiêu đề.");
    const all = radioAll.checked;
    if (!all && picked.size === 0) return fail("Chưa chọn người nhận.");
    const daysValue = days.value.trim() === "" ? null : Number(days.value);
    if (all) {
      const fresh = await api<Meta>("/api/admin/gifts/meta"); // the count when the page loaded may be old
      if (fresh.status === 200) meta.characters = fresh.data.characters;
    }
    const count = all ? meta.characters : picked.size;
    const nameOf = (id: string) => meta.items.find((i) => i.id === id)?.nameVi ?? id;
    const what = [gift.linh_thach ? `${gift.linh_thach} Linh Thạch` : "", gift.cong_hien ? `${gift.cong_hien} Cống Hiến` : "", gift.tien_ngoc ? `${gift.tien_ngoc} Tiên Ngọc` : "", ...items.map((i) => `${nameOf(i.type)} × ${i.qty}`)].filter(Boolean).join(", ") || "(không có gì)";
    const ok = window.confirm(`Gửi «${subject.value.trim()}» (${what}) cho ${all ? `TOÀN BỘ SERVER, ${count} nhân vật` : `${count} nhân vật`}?\nƯớc tính ${count * 3} dòng ghi D1. Thư không thu hồi được.`);
    if (!ok) return;
    send.disabled = true;
    msg.textContent = "Đang gửi...";
    msg.className = "msg muted";
    const r = await api<{ recipients?: number; duplicate?: boolean; error?: string }>("/api/admin/gifts/send", {
      method: "POST",
      body: { batchId, subject: subject.value, body: body.value, audience: all ? { kind: "all" } : { kind: "list", characterIds: [...picked.keys()] }, gift, expiresInDays: daysValue },
    });
    send.disabled = false;
    if (r.status !== 200) return fail(ERRORS[r.data.error ?? ""] ?? `Lỗi ${r.status}.`);
    msg.textContent = r.data.duplicate ? `Lần gửi này đã được gửi trước đó (${r.data.recipients} nhân vật), không gửi lại.` : `Đã gửi cho ${r.data.recipients} nhân vật. Người đang online được báo ngay.`;
    msg.className = "msg ok";
    batchId = newBatchId();
    picked.clear();
    renderPicked();
    onSent();
  });

  syncAudience();
  renderPicked();
  const field = (label: string, ...children: Array<Node | null>) => h("label", { class: "filter wide-field" }, label, ...children);
  return h(
    "section",
    { class: "form" },
    h("h3", null, "Gửi quà mới"),
    h("div", { class: "radios" }, h("label", { class: "radio" }, radioList, "Chọn người nhận"), h("label", { class: "radio" }, radioAll, "Toàn bộ server (sự kiện)")),
    listBox,
    allBox,
    field("Tiêu đề", subject),
    field("Nội dung", body),
    h("div", { class: "toolbar" }, field("Linh Thạch", money.linh_thach), field("Cống Hiến", money.cong_hien), field("Tiên Ngọc", money.tien_ngoc)),
    h("div", null, h("b", null, "Vật phẩm "), h("span", { class: "muted" }, `(tối đa ${meta.limits.itemKinds}; trang bị chưa gửi được)`), itemRows, addItem),
    field("Hết hạn sau (ngày)", days),
    h("p", { class: "muted" }, "Người nhận chỉ nhận được khi túi đồ đủ chỗ cho mọi vật phẩm; tiền và vật phẩm được tạo lúc người chơi bấm Nhận."),
    h("div", { class: "toolbar" }, send),
    msg,
  );
}

/** The history of sends: a list view; `reload()` loads the current page again (called after a send). */
function historyView(): { node: HTMLElement; reload: () => void } {
  const controls = { search: () => undefined as void, reload: () => undefined as void };
  const node = listView<Batch>({
    columns: [
      { key: "createdAt", label: "Thời gian", render: (r) => formatTime(r.createdAt) },
      { key: "adminEmail", label: "Admin", render: (r) => r.adminEmail },
      { key: "subject", label: "Tiêu đề", render: (r) => r.subject },
      { key: "audience", label: "Người nhận", render: (r) => (r.audience === "all" ? `Toàn bộ server (${r.recipients})` : `${r.recipients} nhân vật`) },
      { key: "gift", label: "Quà", render: (r) => describe(r.attachments) },
      { key: "claimed", label: "Đã nhận", render: (r) => `${r.claimed}/${r.recipients}` },
      { key: "expiresAt", label: "Hạn", render: (r) => (r.expiresAt === null ? "Không hết hạn" : formatTime(r.expiresAt)) },
    ],
    defaultSort: { key: "createdAt", dir: "desc" },
    hideSearch: true,
    controls,
    fetchPage: async (q) => {
      const r = await api<{ rows: Batch[]; total: number }>(`/api/admin/gifts/history?page=${q.page}&size=${q.size}`);
      return r.status === 200 ? { rows: r.data.rows, total: r.data.total } : null;
    },
  });
  return { node, reload: () => controls.reload() };
}
