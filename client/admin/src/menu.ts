/** The admin menu: one entry per screen. `phase` is the PHASE3.md sub-phase that builds it; entries without `ready` are shown disabled. */
export interface MenuItem {
  path: string;
  label: string;
  hint: string;
  phase: string;
  ready?: boolean;
}

export const MENU: MenuItem[] = [
  { path: "/admin/accounts", label: "Tài khoản", hint: "Danh sách, ban, đặt mật khẩu, nhân vật", phase: "3m" },
  { path: "/admin/maps", label: "Bản đồ", hint: "Cổng, NPC, bãi quái, boss", phase: "3l" },
  { path: "/admin/npcs", label: "NPC", hint: "Thương nhân, Đan Sư, thợ rèn, vệ binh...", phase: "3k" },
  { path: "/admin/monsters", label: "Quái / BOSS", hint: "Chỉ số, kỹ năng, bảng rơi", phase: "3j" },
  { path: "/admin/items", label: "Vật phẩm", hint: "Đan, nguyên liệu, bí tịch (trang bị: 3g-b)", phase: "3g", ready: true },
  { path: "/admin/skills", label: "Kỹ năng", hint: "Tên, sức mạnh, MP, hồi chiêu, tầm, hiệu ứng", phase: "3h", ready: true },
  { path: "/admin/talents", label: "Thiên phú", hint: "Linh căn, hệ biến dị, thể chất", phase: "3i", ready: true },
  { path: "/admin/quests", label: "Nhiệm vụ", hint: "Yêu cầu, điều kiện nhận, thưởng", phase: "3e", ready: true },
  { path: "/admin/realms", label: "Cảnh giới", hint: "EXP, đột phá, tràn EXP", phase: "3f", ready: true },
  { path: "/admin/potential", label: "Chỉ số tiềm năng", hint: "Hệ số tiềm năng sang chỉ số", phase: "3f", ready: true },
  { path: "/admin/misc", label: "Chỉ số khác", hint: "Sát khí, sát nhân, anh hùng, truyền tống, vùng nhìn, cài đặt game", phase: "3c", ready: true },
  { path: "/admin/gifts", label: "Gửi quà", hint: "Tiền, vật phẩm vào hòm thư: nhiều người hoặc toàn server", phase: "3d", ready: true },
  { path: "/admin/currency", label: "Quản lý tiền tệ", hint: "Tìm theo nhóm, chi tiết, kiểm duyệt số dư", phase: "3b", ready: true },
  { path: "/admin/log", label: "Nhật ký admin", hint: "Admin đã thay đổi gì, ở đâu, khi nào", phase: "3a", ready: true },
];
