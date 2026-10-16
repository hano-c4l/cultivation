/** All player-facing strings live here. Code identifiers stay in English. */
export const vi = {
  connecting: "Đang kết nối…",
  connected: (online: number, ping: number) => `Đang online: ${online} · Độ trễ: ${ping} ms`,
  hint: "Chạm / nhấp để di chuyển",
  disconnected: "Mất kết nối, đang thử lại…",
  kicked: "Tài khoản đăng nhập ở nơi khác.",
  guestPrefix: "Đạo hữu",
} as const;
