import { describe, expect, it } from "vitest";
import { decideAdminPage, isAdminPagePath } from "./admin-page-rules";

describe("isAdminPagePath", () => {
  it("covers the admin app and the two old pages, nothing else", () => {
    for (const p of ["/admin", "/admin/", "/admin/login", "/admin/audit/12", "/admin.html", "/admin-constitutions.html"]) expect(isAdminPagePath(p)).toBe(true);
    for (const p of ["/", "/administrator", "/admins", "/api/admin/me", "/assets/admin-x.js"]) expect(isAdminPagePath(p)).toBe(false);
  });
});

describe("decideAdminPage", () => {
  it("serves the app to an admin everywhere except the login page", () => {
    for (const p of ["/admin", "/admin/", "/admin/index", "/admin/audit", "/admin/anything/deep"]) expect(decideAdminPage(p, "admin")).toEqual({ kind: "shell" });
    expect(decideAdminPage("/admin/login", "admin")).toEqual({ kind: "redirect", to: "/admin" });
    expect(decideAdminPage("/admin/login/", "admin")).toEqual({ kind: "redirect", to: "/admin" });
  });

  it("sends anyone who is not an admin to the login page, which itself is served", () => {
    for (const role of [null, "player"] as const) {
      for (const p of ["/admin", "/admin/", "/admin/index", "/admin/audit", "/admin/accounts/5"]) expect(decideAdminPage(p, role)).toEqual({ kind: "redirect", to: "/admin/login" });
      expect(decideAdminPage("/admin/login", role)).toEqual({ kind: "shell" });
      expect(decideAdminPage("/admin/login/", role)).toEqual({ kind: "shell" });
    }
  });

  it("sends the old static pages to the new admin, whoever asks", () => {
    for (const role of [null, "player", "admin"] as const) {
      expect(decideAdminPage("/admin.html", role)).toEqual({ kind: "redirect", to: "/admin" });
      expect(decideAdminPage("/admin-constitutions.html", role)).toEqual({ kind: "redirect", to: "/admin" });
    }
  });
});
