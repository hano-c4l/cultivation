-- Phase 2: the constitution catalogue as data, so an admin screen can manage it later.
-- Seeded from shared/src/constitutions.ts (DEFAULT_CATALOG); a server test loads these tables and checks they equal it.
--
-- Rules the future admin write path must keep (shared validateCatalog enforces them):
--  * a constitution id never changes and a row is never deleted: characters.constitution refers to it. Use enabled = 0
--    to stop it being rolled for new characters; holders keep it and its effects.
--  * tiers are numbered 1, 2, 3, ... and each constitution's tier weights sum to 100;
--  * each tier owns its COMPLETE list of effects (a higher tier does not inherit from a lower one);
--  * exactly one default constitution (the remainder of the roll), always enabled.
-- The vocabulary of stat / target_kind / target_tag is deliberately NOT a SQL CHECK: it lives in shared code so adding
-- a stat needs no migration. Only structural rules are checked here.

CREATE TABLE constitutions (
  id TEXT PRIMARY KEY,
  name_vi TEXT NOT NULL,
  desc_vi TEXT NOT NULL DEFAULT '',
  -- Out of 10000 rolls (ignored for the default constitution, which takes the remainder).
  roll_weight INTEGER NOT NULL DEFAULT 0 CHECK (roll_weight >= 0),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);
-- At most one default.
CREATE UNIQUE INDEX idx_constitutions_default ON constitutions(is_default) WHERE is_default = 1;

CREATE TABLE constitution_tiers (
  constitution_id TEXT NOT NULL REFERENCES constitutions(id),
  tier INTEGER NOT NULL CHECK (tier >= 1),
  name_vi TEXT NOT NULL,
  -- Out of 100, given the constitution.
  roll_weight INTEGER NOT NULL DEFAULT 0 CHECK (roll_weight >= 0),
  PRIMARY KEY (constitution_id, tier)
) WITHOUT ROWID;

CREATE TABLE constitution_effects (
  id INTEGER PRIMARY KEY,
  constitution_id TEXT NOT NULL,
  tier INTEGER NOT NULL CHECK (tier >= 1),
  -- A key of CONSTITUTION_STATS in shared code (skill_damage, move_speed, exp_gain, ...).
  stat TEXT NOT NULL,
  -- all | element | weapon | skill, and the tag it points at ('' for all): an element id, a weapon family or a skill id.
  target_kind TEXT NOT NULL,
  target_tag TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL CHECK (mode IN ('percent', 'flat')),
  value REAL NOT NULL,
  FOREIGN KEY (constitution_id, tier) REFERENCES constitution_tiers(constitution_id, tier),
  UNIQUE (constitution_id, tier, stat, target_kind, target_tag, mode)
);

-- One version per kind of configuration. An admin save bumps it in the same batch as the change; rooms and the Worker
-- cache the catalogue by version.
CREATE TABLE config_versions (
  name TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
INSERT INTO config_versions (name, version, updated_at) VALUES ('constitutions', 1, 0);

INSERT INTO constitutions (id, name_vi, desc_vi, roll_weight, is_default, enabled, sort_order) VALUES ('kiem_the', 'Kiếm Thể', 'Sinh ra đã hợp với kiếm đạo: tăng sát thương và độ thuần thục của các kỹ năng kiếm.', 150, 0, 1, 10);
INSERT INTO constitutions (id, name_vi, desc_vi, roll_weight, is_default, enabled, sort_order) VALUES ('loi_the', 'Lôi Thể', 'Thân thể dẫn lôi: tăng sát thương và độ thuần thục của các kỹ năng hệ Lôi.', 150, 0, 1, 20);
INSERT INTO constitutions (id, name_vi, desc_vi, roll_weight, is_default, enabled, sort_order) VALUES ('thuy_linh_the', 'Thủy Linh Thể', 'Thân hợp với thủy khí: tăng sát thương và độ thuần thục của các kỹ năng hệ Thủy.', 200, 0, 1, 30);
INSERT INTO constitutions (id, name_vi, desc_vi, roll_weight, is_default, enabled, sort_order) VALUES ('trong_dong', 'Trọng Đồng', 'Đôi mắt đặc biệt nhìn thấu hư thực: tăng độ thuần thục của mọi kỹ năng.', 100, 0, 1, 40);
INSERT INTO constitutions (id, name_vi, desc_vi, roll_weight, is_default, enabled, sort_order) VALUES ('tien_cot', 'Tiên Cốt', 'Xương cốt có tiên khí: tăng nhẹ sát thương của mọi kỹ năng và độ thuần thục.', 80, 0, 1, 50);
INSERT INTO constitutions (id, name_vi, desc_vi, roll_weight, is_default, enabled, sort_order) VALUES ('thanh_the', 'Thánh Thể', 'Thể chất hiếm có bậc nhất: tăng sát thương và độ thuần thục của mọi kỹ năng.', 20, 0, 1, 60);
INSERT INTO constitutions (id, name_vi, desc_vi, roll_weight, is_default, enabled, sort_order) VALUES ('pham_the', 'Phàm Thể', 'Thể chất bình thường, không có gì đặc biệt.', 0, 1, 1, 1000);

INSERT INTO constitution_tiers (constitution_id, tier, name_vi, roll_weight) VALUES ('kiem_the', 1, 'Kiếm Thể', 70);
INSERT INTO constitution_tiers (constitution_id, tier, name_vi, roll_weight) VALUES ('kiem_the', 2, 'Tiên Thiên Kiếm Thể', 25);
INSERT INTO constitution_tiers (constitution_id, tier, name_vi, roll_weight) VALUES ('kiem_the', 3, 'Đại Đạo Kiếm Thể', 5);
INSERT INTO constitution_tiers (constitution_id, tier, name_vi, roll_weight) VALUES ('loi_the', 1, 'Lôi Thể', 80);
INSERT INTO constitution_tiers (constitution_id, tier, name_vi, roll_weight) VALUES ('loi_the', 2, 'Cửu Thiên Lôi Thể', 20);
INSERT INTO constitution_tiers (constitution_id, tier, name_vi, roll_weight) VALUES ('thuy_linh_the', 1, 'Thủy Linh Thể', 80);
INSERT INTO constitution_tiers (constitution_id, tier, name_vi, roll_weight) VALUES ('thuy_linh_the', 2, 'Huyền Thủy Linh Thể', 20);
INSERT INTO constitution_tiers (constitution_id, tier, name_vi, roll_weight) VALUES ('trong_dong', 1, 'Trọng Đồng', 85);
INSERT INTO constitution_tiers (constitution_id, tier, name_vi, roll_weight) VALUES ('trong_dong', 2, 'Chí Tôn Trọng Đồng', 15);
INSERT INTO constitution_tiers (constitution_id, tier, name_vi, roll_weight) VALUES ('tien_cot', 1, 'Tiên Cốt', 100);
INSERT INTO constitution_tiers (constitution_id, tier, name_vi, roll_weight) VALUES ('thanh_the', 1, 'Thánh Thể', 80);
INSERT INTO constitution_tiers (constitution_id, tier, name_vi, roll_weight) VALUES ('thanh_the', 2, 'Đại Thánh Thể', 17);
INSERT INTO constitution_tiers (constitution_id, tier, name_vi, roll_weight) VALUES ('thanh_the', 3, 'Tiên Thể', 3);
INSERT INTO constitution_tiers (constitution_id, tier, name_vi, roll_weight) VALUES ('pham_the', 1, 'Phàm Thể', 100);

INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('kiem_the', 1, 'skill_damage', 'weapon', 'kiem', 'percent', 8);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('kiem_the', 1, 'skill_mastery', 'weapon', 'kiem', 'percent', 10);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('kiem_the', 2, 'skill_damage', 'weapon', 'kiem', 'percent', 16);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('kiem_the', 2, 'skill_mastery', 'weapon', 'kiem', 'percent', 20);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('kiem_the', 3, 'skill_damage', 'weapon', 'kiem', 'percent', 24);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('kiem_the', 3, 'skill_mastery', 'weapon', 'kiem', 'percent', 30);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('loi_the', 1, 'skill_damage', 'element', 'loi', 'percent', 8);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('loi_the', 1, 'skill_mastery', 'element', 'loi', 'percent', 10);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('loi_the', 2, 'skill_damage', 'element', 'loi', 'percent', 16);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('loi_the', 2, 'skill_mastery', 'element', 'loi', 'percent', 20);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('thuy_linh_the', 1, 'skill_damage', 'element', 'thuy', 'percent', 8);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('thuy_linh_the', 1, 'skill_mastery', 'element', 'thuy', 'percent', 10);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('thuy_linh_the', 2, 'skill_damage', 'element', 'thuy', 'percent', 16);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('thuy_linh_the', 2, 'skill_mastery', 'element', 'thuy', 'percent', 20);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('trong_dong', 1, 'skill_damage', 'all', '', 'percent', 3);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('trong_dong', 1, 'skill_mastery', 'all', '', 'percent', 12);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('trong_dong', 2, 'skill_damage', 'all', '', 'percent', 6);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('trong_dong', 2, 'skill_mastery', 'all', '', 'percent', 24);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('tien_cot', 1, 'skill_damage', 'all', '', 'percent', 6);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('tien_cot', 1, 'skill_mastery', 'all', '', 'percent', 6);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('thanh_the', 1, 'skill_damage', 'all', '', 'percent', 10);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('thanh_the', 1, 'skill_mastery', 'all', '', 'percent', 10);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('thanh_the', 2, 'skill_damage', 'all', '', 'percent', 20);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('thanh_the', 2, 'skill_mastery', 'all', '', 'percent', 20);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('thanh_the', 3, 'skill_damage', 'all', '', 'percent', 30);
INSERT INTO constitution_effects (constitution_id, tier, stat, target_kind, target_tag, mode, value) VALUES ('thanh_the', 3, 'skill_mastery', 'all', '', 'percent', 30);
