PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(1,'0001_init.sql','2026-10-16 14:05:51');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(2,'0002_accounts.sql','2026-10-16 15:34:25');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(3,'0003_progression.sql','2026-10-17 06:47:26');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(4,'0004_root_grade.sql','2026-10-17 06:47:26');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(5,'0005_economy.sql','2026-10-17 11:18:04');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(6,'0006_inventory.sql','2026-10-17 15:15:06');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(7,'0007_constitution.sql','2026-10-17 15:15:06');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(8,'0008_constitution_catalog.sql','2026-10-17 15:15:06');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(9,'0009_equipment.sql','2026-10-18 02:27:35');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(10,'0010_gear_elements.sql','2026-10-18 02:27:35');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(11,'0011_refine.sql','2026-10-18 02:27:35');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(12,'0012_skills.sql','2026-10-18 04:40:51');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(13,'0013_vitals.sql','2026-10-18 04:40:51');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(14,'0014_roots.sql','2026-10-18 04:40:52');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(15,'0015_bag_8x8_settings.sql','2026-10-18 09:59:33');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(16,'0016_skill_tiers.sql','2026-10-18 09:59:33');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(17,'0017_breakthrough.sql','2026-10-18 17:20:59');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(18,'0018_paths.sql','2026-10-18 17:20:59');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(19,'0019_shop.sql','2026-10-19 15:15:40');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(20,'0020_quests.sql','2026-10-19 16:46:53');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(21,'0021_path_quests.sql','2026-10-20 11:11:50');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(22,'0022_pk.sql','2026-10-20 11:11:50');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(23,'0023_path_quest_steps.sql','2026-10-20 16:23:21');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(24,'0024_daily_quests.sql','2026-10-20 16:23:22');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(25,'0025_leaderboard_index.sql','2026-10-21 13:40:53');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(26,'0026_world_boss.sql','2026-10-21 13:40:53');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(27,'0027_gear_master.sql','2026-10-22 01:27:28');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(28,'0028_blacksmith.sql','2026-10-22 01:27:28');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(29,'0029_mounted.sql','2026-10-22 10:20:36');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(30,'0030_game_tuning.sql','2026-10-22 15:49:31');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(31,'0031_breakthrough_quest_levels.sql','2026-10-22 15:49:31');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(32,'0032_shop_merchants.sql','2026-10-23 06:11:06');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(33,'0033_shop_mutant_gear.sql','2026-10-23 06:11:06');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(34,'0034_tuning_regroup.sql','2026-10-23 06:11:06');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(35,'0035_admin_audit.sql','2026-10-24 06:33:14');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(36,'0036_currency_totals.sql','2026-10-24 11:00:58');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(37,'0037_currency_groups_audit.sql','2026-10-24 14:19:40');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(38,'0038_gifts.sql','2026-10-24 18:53:35');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(39,'0039_quest_deletion.sql','2026-10-24 18:53:35');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(40,'0040_items.sql','2026-10-24 18:53:35');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(41,'0041_alchemist.sql','2026-10-25 12:44:34');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(42,'0042_merchant_split.sql','2026-10-25 12:44:35');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(43,'0043_map_recipes.sql','2026-10-25 12:44:35');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(44,'0044_account_bans.sql','2026-10-25 12:44:35');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(45,'0045_character_review.sql','2026-10-25 12:44:35');
INSERT INTO "d1_migrations" ("id","name","applied_at") VALUES(46,'0046_map_names_last_login_character_delete.sql','2026-10-25 14:20:27');
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pw_hash TEXT NOT NULL,
  pw_salt TEXT NOT NULL,
  pw_iterations INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
  created_at INTEGER NOT NULL
, ban_until INTEGER, ban_forever INTEGER NOT NULL DEFAULT 0, ban_reason TEXT, banned_by TEXT, last_login_at INTEGER);
INSERT INTO "accounts" ("id","email","pw_hash","pw_salt","pw_iterations","role","created_at","ban_until","ban_forever","ban_reason","banned_by","last_login_at") VALUES('695239d9-79eb-4b3c-9c75-ed9a1a96259c','test01@gmail.com','YBamzJhA3zemBm5f40PN7H1KWOrApfKSpzb3Iq2agJw=','1/U1zIwEaePfJ6MNrBxt7w==',100000,'player',1792164998079,NULL,0,NULL,NULL,NULL);
INSERT INTO "accounts" ("id","email","pw_hash","pw_salt","pw_iterations","role","created_at","ban_until","ban_forever","ban_reason","banned_by","last_login_at") VALUES('01c5b071-b80b-48bf-9f53-95beba3eb2b2','test02@gmail.com','tSU41Kboio2GWbazg6tpEjbTt4jcyrBlFfO7nY7baWI=','IFF9Cfp5ebo/PP5n20qoTQ==',100000,'player',1792165038298,NULL,0,NULL,NULL,NULL);
INSERT INTO "accounts" ("id","email","pw_hash","pw_salt","pw_iterations","role","created_at","ban_until","ban_forever","ban_reason","banned_by","last_login_at") VALUES('9a128068-606a-41f7-b926-2da1b8f1b774','anhpkv1410@gmail.com','SdMNn7Rt3PjB8mqj8Jg+yTjJ0VY4BMLxSuuD0fTJpPA=','17x9XNrx0TkHZUI66X9nlA==',100000,'player',1792175151117,NULL,0,NULL,NULL,NULL);
INSERT INTO "accounts" ("id","email","pw_hash","pw_salt","pw_iterations","role","created_at","ban_until","ban_forever","ban_reason","banned_by","last_login_at") VALUES('3ed54ce9-76cf-4116-8114-9eb99db04bfd','admin@hanowl.com','p/123RROf9KNsL8N/A6EVCicudwfDiA7iZONFN5rNg0=','xFIsob8z97g4cw52K7OCow==',100000,'admin',1792250217808,NULL,0,NULL,NULL,NULL);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO "sessions" ("token_hash","account_id","expires_at","created_at") VALUES('ff372a36e170752896972d7bcaaed66a65f8d06da0f51810d5bc6d10d4e081bc','695239d9-79eb-4b3c-9c75-ed9a1a96259c',1794756998141,1792164998141);
INSERT INTO "sessions" ("token_hash","account_id","expires_at","created_at") VALUES('c89f72dab63b409291c40fa75decbbc16ef88b6e9823379765d570c23d579d77','01c5b071-b80b-48bf-9f53-95beba3eb2b2',1794757038354,1792165038354);
INSERT INTO "sessions" ("token_hash","account_id","expires_at","created_at") VALUES('6d4a2489b2ab6270552a9d5cf9ef8e2009463b4df45bc309abbea2e89c56214a','695239d9-79eb-4b3c-9c75-ed9a1a96259c',1794767042807,1792175042807);
INSERT INTO "sessions" ("token_hash","account_id","expires_at","created_at") VALUES('bb7047f9a3cfefd664631efdcb20d7fbfab6c481c0ca82385ad027bb041ea750','9a128068-606a-41f7-b926-2da1b8f1b774',1794767151159,1792175151159);
INSERT INTO "sessions" ("token_hash","account_id","expires_at","created_at") VALUES('a326868b9a512c7c5cb5283af62be7d4677d1eee2d2e024379ffa1e5469080a8','695239d9-79eb-4b3c-9c75-ed9a1a96259c',1794767358912,1792175358912);
INSERT INTO "sessions" ("token_hash","account_id","expires_at","created_at") VALUES('dae0b25dba11d4b0d72556aae6e7b339690d9fae41040a06b80f0bc7293728bb','3ed54ce9-76cf-4116-8114-9eb99db04bfd',1794842218047,1792250218047);
CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  spiritual_root TEXT NOT NULL CHECK (spiritual_root IN ('kim', 'moc', 'thuy', 'hoa', 'tho')),
  map_id TEXT NOT NULL DEFAULT 'town',
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  realm INTEGER NOT NULL DEFAULT 0,
  stage INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL DEFAULT 0,
  potential_points INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
, stat_can_cot INTEGER NOT NULL DEFAULT 5, stat_than_phap INTEGER NOT NULL DEFAULT 5, stat_ngo_tinh INTEGER NOT NULL DEFAULT 5, stat_linh_luc INTEGER NOT NULL DEFAULT 5, stat_than_thuc INTEGER NOT NULL DEFAULT 5, stat_phuc_duyen INTEGER NOT NULL DEFAULT 5, root_grade INTEGER NOT NULL DEFAULT 0, bag_tabs INTEGER NOT NULL DEFAULT 1 CHECK (bag_tabs >= 1), constitution TEXT NOT NULL DEFAULT 'pham_the', constitution_tier INTEGER NOT NULL DEFAULT 1 CHECK (constitution_tier >= 1), gender TEXT NOT NULL DEFAULT 'male'
  CHECK (gender IN ('male', 'female', 'male_wears_female', 'female_wears_male')), hotbar TEXT NOT NULL DEFAULT '[]', vitals TEXT, roots TEXT NOT NULL DEFAULT '', bt_started_at INTEGER, paths TEXT NOT NULL DEFAULT '', sat_khi INTEGER NOT NULL DEFAULT 0 CHECK (sat_khi >= 0), sat_nhan INTEGER NOT NULL DEFAULT 0 CHECK (sat_nhan >= 0), anh_hung INTEGER NOT NULL DEFAULT 0 CHECK (anh_hung >= 0), mounted INTEGER NOT NULL DEFAULT 0 CHECK (mounted IN (0, 1)), review_until INTEGER, review_by TEXT, deleted_at INTEGER);
INSERT INTO "characters" ("id","account_id","name","spiritual_root","map_id","x","y","realm","stage","exp","potential_points","created_at","updated_at","stat_can_cot","stat_than_phap","stat_ngo_tinh","stat_linh_luc","stat_than_thuc","stat_phuc_duyen","root_grade","bag_tabs","constitution","constitution_tier","gender","hotbar","vitals","roots","bt_started_at","paths","sat_khi","sat_nhan","anh_hung","mounted","review_until","review_by","deleted_at") VALUES('b6fddb21-0c2e-430d-b514-0455a0f34468','695239d9-79eb-4b3c-9c75-ed9a1a96259c','Test01','kim','town',13.11,19.01,0,1,0,11,1792165002829,1792175424475,5,7,5,5,5,5,4,1,'pham_the',1,'male','[]',NULL,'',NULL,'',0,0,0,0,NULL,NULL,NULL);
INSERT INTO "characters" ("id","account_id","name","spiritual_root","map_id","x","y","realm","stage","exp","potential_points","created_at","updated_at","stat_can_cot","stat_than_phap","stat_ngo_tinh","stat_linh_luc","stat_than_thuc","stat_phuc_duyen","root_grade","bag_tabs","constitution","constitution_tier","gender","hotbar","vitals","roots","bt_started_at","paths","sat_khi","sat_nhan","anh_hung","mounted","review_until","review_by","deleted_at") VALUES('e6d2648a-bf0f-411f-a6f0-f3aa3e3d60e2','01c5b071-b80b-48bf-9f53-95beba3eb2b2','Test02','thuy','town',15,12,0,1,0,5,1792165043736,1792165055546,5,5,5,5,7,5,0,1,'pham_the',1,'male','[]',NULL,'',NULL,'',0,0,0,0,NULL,NULL,NULL);
INSERT INTO "characters" ("id","account_id","name","spiritual_root","map_id","x","y","realm","stage","exp","potential_points","created_at","updated_at","stat_can_cot","stat_than_phap","stat_ngo_tinh","stat_linh_luc","stat_than_thuc","stat_phuc_duyen","root_grade","bag_tabs","constitution","constitution_tier","gender","hotbar","vitals","roots","bt_started_at","paths","sat_khi","sat_nhan","anh_hung","mounted","review_until","review_by","deleted_at") VALUES('94272936-12a2-4b6f-b664-6860f61d3ce5','9a128068-606a-41f7-b926-2da1b8f1b774','ChickHano','hoa','town',32.42,17.76,0,1,0,5,1792175161776,1792175282633,5,5,5,7,5,5,0,1,'pham_the',1,'female','[]',NULL,'',NULL,'',0,0,0,0,NULL,NULL,NULL);
INSERT INTO "characters" ("id","account_id","name","spiritual_root","map_id","x","y","realm","stage","exp","potential_points","created_at","updated_at","stat_can_cot","stat_than_phap","stat_ngo_tinh","stat_linh_luc","stat_than_thuc","stat_phuc_duyen","root_grade","bag_tabs","constitution","constitution_tier","gender","hotbar","vitals","roots","bt_started_at","paths","sat_khi","sat_nhan","anh_hung","mounted","review_until","review_by","deleted_at") VALUES('9092e88e-1b23-4872-9bde-842675100ef3','3ed54ce9-76cf-4116-8114-9eb99db04bfd','Admin','hoa','town',17.05,14.98,0,1,0,5,1792250229165,1792250242143,5,5,5,7,5,5,0,1,'pham_the',1,'male','[]',NULL,'',NULL,'',0,0,0,0,NULL,NULL,NULL);
CREATE TABLE auth_attempts (
  key TEXT NOT NULL,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window)
);
INSERT INTO "auth_attempts" ("key","window","count") VALUES('reg:2402:800:6e27:bb5:dcbd:aa7:762:da0d',1792164600,2);
INSERT INTO "auth_attempts" ("key","window","count") VALUES('login-ip:2402:800:6e27:bb5:a800:7239:bdb:a214',1792174980,1);
INSERT INTO "auth_attempts" ("key","window","count") VALUES('login-email:test01@gmail.com',1792174800,2);
INSERT INTO "auth_attempts" ("key","window","count") VALUES('login-ip:2402:800:6e27:bb5:a800:7239:bdb:a214',1792175040,1);
INSERT INTO "auth_attempts" ("key","window","count") VALUES('reg:2a09:bac2:d4c5:16c8::245:1e',1792174800,1);
INSERT INTO "auth_attempts" ("key","window","count") VALUES('login-ip:2402:800:6e27:bb5:a800:7239:bdb:a214',1792175340,1);
INSERT INTO "auth_attempts" ("key","window","count") VALUES('login-email:test01@gmail.com',1792175100,1);
INSERT INTO "auth_attempts" ("key","window","count") VALUES('login-ip:2402:800:6e27:bb5:5d68:2e01:5084:1e15',1792250160,1);
INSERT INTO "auth_attempts" ("key","window","count") VALUES('login-email:admin@hanowl.com',1792250100,1);
INSERT INTO "auth_attempts" ("key","window","count") VALUES('reg:2402:800:6e27:bb5:5d68:2e01:5084:1e15',1792249800,1);
INSERT INTO "auth_attempts" ("key","window","count") VALUES('login-ip:2402:800:6e27:2c1f:907e:1ebf:16ea:3057',1792932300,1);
INSERT INTO "auth_attempts" ("key","window","count") VALUES('login-email:nobody@example.test',1792932300,1);
CREATE TABLE currency_balances (
  character_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('linh_thach', 'cong_hien', 'tien_ngoc')),
  balance INTEGER NOT NULL CHECK (balance >= 0),
  PRIMARY KEY (character_id, currency)
) WITHOUT ROWID;
CREATE TABLE item_instances (
  id TEXT PRIMARY KEY,
  owner_character_id TEXT NOT NULL REFERENCES characters(id),
  item_type TEXT NOT NULL,
  created_at INTEGER NOT NULL
, qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0), bag_tab INTEGER CHECK (bag_tab IS NULL OR bag_tab >= 0), cell INTEGER CHECK (cell IS NULL OR cell >= 0), equip_slot TEXT, durability INTEGER CHECK (durability IS NULL OR durability >= 0), max_durability INTEGER CHECK (max_durability IS NULL OR max_durability >= 1), refine_level INTEGER CHECK (refine_level IS NULL OR refine_level >= 0), refine_exp INTEGER CHECK (refine_exp IS NULL OR refine_exp >= 0), rolled_stats TEXT, enhance_level INTEGER NOT NULL DEFAULT 0 CHECK (enhance_level >= 0 AND enhance_level <= 10), enhance_bonus INTEGER NOT NULL DEFAULT 0 CHECK (enhance_bonus >= 0 AND enhance_bonus <= 100));
CREATE TABLE mailbox (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  currency TEXT CHECK (currency IN ('linh_thach', 'cong_hien', 'tien_ngoc')),
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  item_id TEXT REFERENCES item_instances(id),
  claimed_at INTEGER,
  created_at INTEGER NOT NULL, expires_at INTEGER, gift TEXT,
  CHECK ((currency IS NULL) = (amount = 0))
);
CREATE TABLE item_grants (
  key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE TABLE inv_guard (ok INTEGER NOT NULL);
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
INSERT INTO "constitutions" ("id","name_vi","desc_vi","roll_weight","is_default","enabled","sort_order") VALUES('kiem_the','Kiếm Thể','Sinh ra đã hợp với kiếm đạo: tăng sát thương và độ thuần thục của các kỹ năng kiếm.',150,0,1,10);
INSERT INTO "constitutions" ("id","name_vi","desc_vi","roll_weight","is_default","enabled","sort_order") VALUES('loi_the','Lôi Thể','Thân thể dẫn lôi: tăng sát thương và độ thuần thục của các kỹ năng hệ Lôi.',150,0,1,20);
INSERT INTO "constitutions" ("id","name_vi","desc_vi","roll_weight","is_default","enabled","sort_order") VALUES('thuy_linh_the','Thủy Linh Thể','Thân hợp với thủy khí: tăng sát thương và độ thuần thục của các kỹ năng hệ Thủy.',200,0,1,30);
INSERT INTO "constitutions" ("id","name_vi","desc_vi","roll_weight","is_default","enabled","sort_order") VALUES('trong_dong','Trọng Đồng','Đôi mắt đặc biệt nhìn thấu hư thực: tăng độ thuần thục của mọi kỹ năng.',100,0,1,40);
INSERT INTO "constitutions" ("id","name_vi","desc_vi","roll_weight","is_default","enabled","sort_order") VALUES('tien_cot','Tiên Cốt','Xương cốt có tiên khí: tăng nhẹ sát thương của mọi kỹ năng và độ thuần thục.',80,0,1,50);
INSERT INTO "constitutions" ("id","name_vi","desc_vi","roll_weight","is_default","enabled","sort_order") VALUES('thanh_the','Thánh Thể','Thể chất hiếm có bậc nhất: tăng sát thương và độ thuần thục của mọi kỹ năng.',20,0,1,60);
INSERT INTO "constitutions" ("id","name_vi","desc_vi","roll_weight","is_default","enabled","sort_order") VALUES('pham_the','Phàm Thể','Thể chất bình thường, không có gì đặc biệt.',0,1,1,1000);
CREATE TABLE constitution_tiers (
  constitution_id TEXT NOT NULL REFERENCES constitutions(id),
  tier INTEGER NOT NULL CHECK (tier >= 1),
  name_vi TEXT NOT NULL,
  -- Out of 100, given the constitution.
  roll_weight INTEGER NOT NULL DEFAULT 0 CHECK (roll_weight >= 0),
  PRIMARY KEY (constitution_id, tier)
) WITHOUT ROWID;
INSERT INTO "constitution_tiers" ("constitution_id","tier","name_vi","roll_weight") VALUES('kiem_the',1,'Kiếm Thể',70);
INSERT INTO "constitution_tiers" ("constitution_id","tier","name_vi","roll_weight") VALUES('kiem_the',2,'Tiên Thiên Kiếm Thể',25);
INSERT INTO "constitution_tiers" ("constitution_id","tier","name_vi","roll_weight") VALUES('kiem_the',3,'Đại Đạo Kiếm Thể',5);
INSERT INTO "constitution_tiers" ("constitution_id","tier","name_vi","roll_weight") VALUES('loi_the',1,'Lôi Thể',80);
INSERT INTO "constitution_tiers" ("constitution_id","tier","name_vi","roll_weight") VALUES('loi_the',2,'Cửu Thiên Lôi Thể',20);
INSERT INTO "constitution_tiers" ("constitution_id","tier","name_vi","roll_weight") VALUES('pham_the',1,'Phàm Thể',100);
INSERT INTO "constitution_tiers" ("constitution_id","tier","name_vi","roll_weight") VALUES('thanh_the',1,'Thánh Thể',80);
INSERT INTO "constitution_tiers" ("constitution_id","tier","name_vi","roll_weight") VALUES('thanh_the',2,'Đại Thánh Thể',17);
INSERT INTO "constitution_tiers" ("constitution_id","tier","name_vi","roll_weight") VALUES('thanh_the',3,'Tiên Thể',3);
INSERT INTO "constitution_tiers" ("constitution_id","tier","name_vi","roll_weight") VALUES('thuy_linh_the',1,'Thủy Linh Thể',80);
INSERT INTO "constitution_tiers" ("constitution_id","tier","name_vi","roll_weight") VALUES('thuy_linh_the',2,'Huyền Thủy Linh Thể',20);
INSERT INTO "constitution_tiers" ("constitution_id","tier","name_vi","roll_weight") VALUES('tien_cot',1,'Tiên Cốt',100);
INSERT INTO "constitution_tiers" ("constitution_id","tier","name_vi","roll_weight") VALUES('trong_dong',1,'Trọng Đồng',85);
INSERT INTO "constitution_tiers" ("constitution_id","tier","name_vi","roll_weight") VALUES('trong_dong',2,'Chí Tôn Trọng Đồng',15);
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
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(1,'kiem_the',1,'skill_damage','weapon','kiem','percent',8);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(2,'kiem_the',1,'skill_mastery','weapon','kiem','percent',10);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(3,'kiem_the',2,'skill_damage','weapon','kiem','percent',16);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(4,'kiem_the',2,'skill_mastery','weapon','kiem','percent',20);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(5,'kiem_the',3,'skill_damage','weapon','kiem','percent',24);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(6,'kiem_the',3,'skill_mastery','weapon','kiem','percent',30);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(7,'loi_the',1,'skill_damage','element','loi','percent',8);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(8,'loi_the',1,'skill_mastery','element','loi','percent',10);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(9,'loi_the',2,'skill_damage','element','loi','percent',16);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(10,'loi_the',2,'skill_mastery','element','loi','percent',20);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(11,'thuy_linh_the',1,'skill_damage','element','thuy','percent',8);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(12,'thuy_linh_the',1,'skill_mastery','element','thuy','percent',10);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(13,'thuy_linh_the',2,'skill_damage','element','thuy','percent',16);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(14,'thuy_linh_the',2,'skill_mastery','element','thuy','percent',20);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(15,'trong_dong',1,'skill_damage','all','','percent',3);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(16,'trong_dong',1,'skill_mastery','all','','percent',12);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(17,'trong_dong',2,'skill_damage','all','','percent',6);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(18,'trong_dong',2,'skill_mastery','all','','percent',24);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(19,'tien_cot',1,'skill_damage','all','','percent',6);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(20,'tien_cot',1,'skill_mastery','all','','percent',6);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(21,'thanh_the',1,'skill_damage','all','','percent',10);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(22,'thanh_the',1,'skill_mastery','all','','percent',10);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(23,'thanh_the',2,'skill_damage','all','','percent',20);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(24,'thanh_the',2,'skill_mastery','all','','percent',20);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(25,'thanh_the',3,'skill_damage','all','','percent',30);
INSERT INTO "constitution_effects" ("id","constitution_id","tier","stat","target_kind","target_tag","mode","value") VALUES(26,'thanh_the',3,'skill_mastery','all','','percent',30);
CREATE TABLE config_versions (
  name TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
INSERT INTO "config_versions" ("name","version","updated_at") VALUES('constitutions',1,0);
INSERT INTO "config_versions" ("name","version","updated_at") VALUES('enhance',1,0);
INSERT INTO "config_versions" ("name","version","updated_at") VALUES('gear_master',2,0);
INSERT INTO "config_versions" ("name","version","updated_at") VALUES('items',1,0);
INSERT INTO "config_versions" ("name","version","updated_at") VALUES('maps',1,0);
INSERT INTO "config_versions" ("name","version","updated_at") VALUES('npcs',1,0);
INSERT INTO "config_versions" ("name","version","updated_at") VALUES('quests',5,0);
INSERT INTO "config_versions" ("name","version","updated_at") VALUES('shop',4,0);
INSERT INTO "config_versions" ("name","version","updated_at") VALUES('tuning',2,0);
CREATE TABLE character_skills (
  character_id TEXT NOT NULL REFERENCES characters(id),
  skill_id TEXT NOT NULL,
  learned_at INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'learned', realm INTEGER NOT NULL DEFAULT 0, level INTEGER NOT NULL DEFAULT 0, mastery INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, skill_id)
) WITHOUT ROWID;
CREATE TABLE game_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
) WITHOUT ROWID;
CREATE TABLE character_paths (
  character_id TEXT NOT NULL REFERENCES characters(id),
  path_id TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 2),
  level INTEGER NOT NULL DEFAULT 0,
  chosen_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, slot),
  UNIQUE (character_id, path_id)
);
CREATE TABLE shop_purchases (
  character_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (character_id, offer_id, day)
);
CREATE TABLE quests (
  id TEXT PRIMARY KEY,
  chain TEXT NOT NULL,
  seq INTEGER NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  def TEXT NOT NULL,
  updated_at INTEGER NOT NULL
, deleted_at INTEGER, tomb INTEGER NOT NULL DEFAULT 0 CHECK (tomb IN (0, 1)));
INSERT INTO "quests" ("id","chain","seq","enabled","def","updated_at","deleted_at","tomb") VALUES('path_kiem_1','path',1,1,'{"id":"path_kiem_1","chain":"path","seq":1,"giver":"path_kiem","titleVi":"Thử kiếm","descVi":"Kiếm tu lấy chiến đấu làm gốc. Hãy ra Hắc Mộc Lâm hạ 30 con quái để chứng tỏ kiếm tâm, rồi quay lại báo cho ta.","enabled":true,"requires":null,"minRealm":1,"path":"kiem","objective":{"kind":"kill","count":30,"map":"forest"},"rewards":{"items":[{"item":"dai_hoi_huyet_dan","qty":2}]}}',0,NULL,0);
INSERT INTO "quests" ("id","chain","seq","enabled","def","updated_at","deleted_at","tomb") VALUES('path_thuat_1','path',3,1,'{"id":"path_thuat_1","chain":"path","seq":3,"giver":"path_thuat","titleVi":"Lễ vật Yêu Đan","descVi":"Thuật tu cần linh khí cô đọng để thi triển pháp thuật. Mang đến 4 Yêu Đan và 8 Linh Thảo làm lễ vật.","enabled":true,"requires":null,"minRealm":1,"path":"thuat","objective":{"kind":"collect","item":"yeu_dan","qty":4,"also":[{"item":"linh_thao","qty":8}]},"rewards":{"items":[{"item":"dai_hoi_huyet_dan","qty":2}]}}',0,NULL,0);
INSERT INTO "quests" ("id","chain","seq","enabled","def","updated_at","deleted_at","tomb") VALUES('path_dan_1','path',5,1,'{"id":"path_dan_1","chain":"path","seq":5,"giver":"path_dan","titleVi":"Dược liệu và đan thuốc","descVi":"Đan tu khởi đầu từ dược liệu và đan cơ bản. Mang đến 30 Linh Thảo và 5 Hồi Huyết Đan.","enabled":true,"requires":null,"minRealm":1,"path":"dan","objective":{"kind":"collect","item":"linh_thao","qty":30,"also":[{"item":"hoi_huyet_dan","qty":5}]},"rewards":{"items":[{"item":"duong_huyet_dan","qty":5}]}}',0,NULL,0);
INSERT INTO "quests" ("id","chain","seq","enabled","def","updated_at","deleted_at","tomb") VALUES('daily_kill','daily',1,1,'{"id":"daily_kill","chain":"daily","seq":1,"giver":"elder","titleVi":"Trừ yêu mỗi ngày","descVi":"Yêu thú ở Hắc Mộc Lâm không bao giờ hết. Mỗi ngày hạ 20 con để giữ an toàn cho thành.","enabled":true,"requires":"newbie_3","minRealm":0,"repeat":"daily","objective":{"kind":"kill","count":20,"map":"forest"},"rewards":{"linhThach":150,"congHien":10,"exp":300}}',0,NULL,0);
INSERT INTO "quests" ("id","chain","seq","enabled","def","updated_at","deleted_at","tomb") VALUES('daily_herb','daily',2,1,'{"id":"daily_herb","chain":"daily","seq":2,"giver":"elder","titleVi":"Dược liệu mỗi ngày","descVi":"Mỗi ngày mang cho ta 10 Linh Thảo để luyện đan cho đệ tử trong thành.","enabled":true,"requires":"newbie_3","minRealm":0,"repeat":"daily","objective":{"kind":"collect","item":"linh_thao","qty":10},"rewards":{"linhThach":100,"congHien":8}}',0,NULL,0);
INSERT INTO "quests" ("id","chain","seq","enabled","def","updated_at","deleted_at","tomb") VALUES('daily_cave','daily',3,1,'{"id":"daily_cave","chain":"daily","seq":3,"giver":"elder","titleVi":"Thám hiểm U Minh Động","descVi":"Từ Trúc Cơ trở đi, mỗi ngày hạ 20 con quái ở U Minh Động.","enabled":true,"requires":"newbie_6","minRealm":1,"repeat":"daily","objective":{"kind":"kill","count":20,"map":"cave"},"rewards":{"linhThach":400,"congHien":20}}',0,NULL,0);
CREATE TABLE character_quests (
  character_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('active', 'done')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  accepted_at INTEGER NOT NULL,
  done_at INTEGER,
  PRIMARY KEY (character_id, quest_id)
);
CREATE TABLE world_boss (
  map_id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  claimed_at INTEGER NOT NULL
);
CREATE TABLE equipment_master (
  item_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  style TEXT NOT NULL,
  realm INTEGER NOT NULL,
  tier INTEGER NOT NULL,
  stats TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.0.1','weapon','u',0,1,'{"attack":[2,4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.0.2','weapon','u',0,2,'{"attack":[4,6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.0.3','weapon','u',0,3,'{"attack":[5,9]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.0.4','weapon','u',0,4,'{"attack":[6,10]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.0.5','weapon','u',0,5,'{"attack":[8,12]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.0.6','weapon','u',0,6,'{"attack":[9,15]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.0.7','weapon','u',0,7,'{"attack":[11,17]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.0.8','weapon','u',0,8,'{"attack":[12,20]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.0.9','weapon','u',0,9,'{"attack":[13,21]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.1.1','weapon','u',1,1,'{"attack":[15,23]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.1.2','weapon','u',1,2,'{"attack":[16,26]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.1.3','weapon','u',1,3,'{"attack":[18,28]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.1.4','weapon','u',1,4,'{"attack":[20,30]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.1.5','weapon','u',1,5,'{"attack":[20,32]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.1.6','weapon','u',1,6,'{"attack":[22,34]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.1.7','weapon','u',1,7,'{"attack":[24,36]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.1.8','weapon','u',1,8,'{"attack":[25,39]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.1.9','weapon','u',1,9,'{"attack":[27,41]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.2.1','weapon','u',2,1,'{"attack":[28,42]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.2.2','weapon','u',2,2,'{"attack":[29,45]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.2.3','weapon','u',2,3,'{"attack":[31,47]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.2.4','weapon','u',2,4,'{"attack":[32,50]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.2.5','weapon','u',2,5,'{"attack":[34,52]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.2.6','weapon','u',2,6,'{"attack":[35,53]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.2.7','weapon','u',2,7,'{"attack":[36,56]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.2.8','weapon','u',2,8,'{"attack":[38,58]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.2.9','weapon','u',2,9,'{"attack":[40,60]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.3.1','weapon','u',3,1,'{"attack":[41,63]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.3.2','weapon','u',3,2,'{"attack":[42,64]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.3.3','weapon','u',3,3,'{"attack":[44,66]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.3.4','weapon','u',3,4,'{"attack":[45,69]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.3.5','weapon','u',3,5,'{"attack":[47,71]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.3.6','weapon','u',3,6,'{"attack":[48,74]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.3.7','weapon','u',3,7,'{"attack":[49,75]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.3.8','weapon','u',3,8,'{"attack":[51,77]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('weapon.u.3.9','weapon','u',3,9,'{"attack":[52,80]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.0.1','hat','m',0,1,'{"defense":[1,2],"maxHp":[3,5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.0.2','hat','m',0,2,'{"defense":[1,3],"maxHp":[4,8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.0.3','hat','m',0,3,'{"defense":[2,4],"maxHp":[7,11]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.0.4','hat','m',0,4,'{"defense":[2,4],"maxHp":[8,14]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.0.5','hat','m',0,5,'{"defense":[3,5],"maxHp":[11,17]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.0.6','hat','m',0,6,'{"defense":[4,6],"maxHp":[12,20]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.0.7','hat','m',0,7,'{"defense":[4,8],"maxHp":[14,22]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.0.8','hat','m',0,8,'{"defense":[4,8],"maxHp":[16,26]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.0.9','hat','m',0,9,'{"defense":[5,9],"maxHp":[18,28]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.1.1','hat','m',1,1,'{"defense":[6,10],"maxHp":[20,32]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.1.2','hat','m',1,2,'{"defense":[6,10],"maxHp":[22,34]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.1.3','hat','m',1,3,'{"defense":[7,11],"maxHp":[24,36]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.1.4','hat','m',1,4,'{"defense":[8,12],"maxHp":[26,40]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.1.5','hat','m',1,5,'{"defense":[8,14],"maxHp":[28,42]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.1.6','hat','m',1,6,'{"defense":[8,14],"maxHp":[30,46]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.1.7','hat','m',1,7,'{"defense":[9,15],"maxHp":[32,48]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.1.8','hat','m',1,8,'{"defense":[10,16],"maxHp":[33,51]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.1.9','hat','m',1,9,'{"defense":[10,16],"maxHp":[36,54]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.2.1','hat','m',2,1,'{"defense":[11,17],"maxHp":[37,57]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.2.2','hat','m',2,2,'{"defense":[12,18],"maxHp":[40,60]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.2.3','hat','m',2,3,'{"defense":[12,20],"maxHp":[41,63]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.2.4','hat','m',2,4,'{"defense":[12,20],"maxHp":[43,65]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.2.5','hat','m',2,5,'{"defense":[13,21],"maxHp":[45,69]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.2.6','hat','m',2,6,'{"defense":[14,22],"maxHp":[47,71]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.2.7','hat','m',2,7,'{"defense":[14,22],"maxHp":[49,75]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.2.8','hat','m',2,8,'{"defense":[15,23],"maxHp":[51,77]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.2.9','hat','m',2,9,'{"defense":[16,24],"maxHp":[52,80]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.3.1','hat','m',3,1,'{"defense":[16,26],"maxHp":[55,83]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.3.2','hat','m',3,2,'{"defense":[16,26],"maxHp":[56,86]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.3.3','hat','m',3,3,'{"defense":[17,27],"maxHp":[59,89]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.3.4','hat','m',3,4,'{"defense":[18,28],"maxHp":[60,92]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.3.5','hat','m',3,5,'{"defense":[19,29],"maxHp":[62,94]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.3.6','hat','m',3,6,'{"defense":[19,29],"maxHp":[64,98]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.3.7','hat','m',3,7,'{"defense":[20,30],"maxHp":[66,100]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.3.8','hat','m',3,8,'{"defense":[20,32],"maxHp":[68,104]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.m.3.9','hat','m',3,9,'{"defense":[20,32],"maxHp":[70,106]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.0.1','hat','f',0,1,'{"defense":[1,2],"maxHp":[3,5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.0.2','hat','f',0,2,'{"defense":[1,3],"maxHp":[4,8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.0.3','hat','f',0,3,'{"defense":[2,4],"maxHp":[7,11]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.0.4','hat','f',0,4,'{"defense":[2,4],"maxHp":[8,14]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.0.5','hat','f',0,5,'{"defense":[3,5],"maxHp":[11,17]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.0.6','hat','f',0,6,'{"defense":[4,6],"maxHp":[12,20]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.0.7','hat','f',0,7,'{"defense":[4,8],"maxHp":[14,22]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.0.8','hat','f',0,8,'{"defense":[4,8],"maxHp":[16,26]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.0.9','hat','f',0,9,'{"defense":[5,9],"maxHp":[18,28]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.1.1','hat','f',1,1,'{"defense":[6,10],"maxHp":[20,32]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.1.2','hat','f',1,2,'{"defense":[6,10],"maxHp":[22,34]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.1.3','hat','f',1,3,'{"defense":[7,11],"maxHp":[24,36]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.1.4','hat','f',1,4,'{"defense":[8,12],"maxHp":[26,40]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.1.5','hat','f',1,5,'{"defense":[8,14],"maxHp":[28,42]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.1.6','hat','f',1,6,'{"defense":[8,14],"maxHp":[30,46]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.1.7','hat','f',1,7,'{"defense":[9,15],"maxHp":[32,48]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.1.8','hat','f',1,8,'{"defense":[10,16],"maxHp":[33,51]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.1.9','hat','f',1,9,'{"defense":[10,16],"maxHp":[36,54]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.2.1','hat','f',2,1,'{"defense":[11,17],"maxHp":[37,57]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.2.2','hat','f',2,2,'{"defense":[12,18],"maxHp":[40,60]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.2.3','hat','f',2,3,'{"defense":[12,20],"maxHp":[41,63]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.2.4','hat','f',2,4,'{"defense":[12,20],"maxHp":[43,65]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.2.5','hat','f',2,5,'{"defense":[13,21],"maxHp":[45,69]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.2.6','hat','f',2,6,'{"defense":[14,22],"maxHp":[47,71]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.2.7','hat','f',2,7,'{"defense":[14,22],"maxHp":[49,75]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.2.8','hat','f',2,8,'{"defense":[15,23],"maxHp":[51,77]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.2.9','hat','f',2,9,'{"defense":[16,24],"maxHp":[52,80]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.3.1','hat','f',3,1,'{"defense":[16,26],"maxHp":[55,83]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.3.2','hat','f',3,2,'{"defense":[16,26],"maxHp":[56,86]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.3.3','hat','f',3,3,'{"defense":[17,27],"maxHp":[59,89]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.3.4','hat','f',3,4,'{"defense":[18,28],"maxHp":[60,92]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.3.5','hat','f',3,5,'{"defense":[19,29],"maxHp":[62,94]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.3.6','hat','f',3,6,'{"defense":[19,29],"maxHp":[64,98]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.3.7','hat','f',3,7,'{"defense":[20,30],"maxHp":[66,100]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.3.8','hat','f',3,8,'{"defense":[20,32],"maxHp":[68,104]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('hat.f.3.9','hat','f',3,9,'{"defense":[20,32],"maxHp":[70,106]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.0.1','robe','m',0,1,'{"defense":[1,3],"maxHp":[4,8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.0.2','robe','m',0,2,'{"defense":[2,4],"maxHp":[8,12]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.0.3','robe','m',0,3,'{"defense":[3,5],"maxHp":[10,16]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.0.4','robe','m',0,4,'{"defense":[4,8],"maxHp":[13,21]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.0.5','robe','m',0,5,'{"defense":[5,9],"maxHp":[16,24]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.0.6','robe','m',0,6,'{"defense":[6,10],"maxHp":[19,29]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.0.7','robe','m',0,7,'{"defense":[7,11],"maxHp":[22,34]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.0.8','robe','m',0,8,'{"defense":[8,12],"maxHp":[24,38]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.0.9','robe','m',0,9,'{"defense":[9,15],"maxHp":[28,42]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.1.1','robe','m',1,1,'{"defense":[10,16],"maxHp":[30,46]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.1.2','robe','m',1,2,'{"defense":[11,17],"maxHp":[33,51]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.1.3','robe','m',1,3,'{"defense":[12,18],"maxHp":[36,56]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.1.4','robe','m',1,4,'{"defense":[12,20],"maxHp":[39,59]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.1.5','robe','m',1,5,'{"defense":[14,22],"maxHp":[42,64]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.1.6','robe','m',1,6,'{"defense":[15,23],"maxHp":[44,68]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.1.7','robe','m',1,7,'{"defense":[16,24],"maxHp":[48,72]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.1.8','robe','m',1,8,'{"defense":[16,26],"maxHp":[51,77]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.1.9','robe','m',1,9,'{"defense":[17,27],"maxHp":[53,81]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.2.1','robe','m',2,1,'{"defense":[19,29],"maxHp":[56,86]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.2.2','robe','m',2,2,'{"defense":[20,30],"maxHp":[59,89]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.2.3','robe','m',2,3,'{"defense":[20,32],"maxHp":[62,94]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.2.4','robe','m',2,4,'{"defense":[21,33],"maxHp":[65,99]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.2.5','robe','m',2,5,'{"defense":[22,34],"maxHp":[68,102]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.2.6','robe','m',2,6,'{"defense":[24,36],"maxHp":[71,107]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.2.7','robe','m',2,7,'{"defense":[24,38],"maxHp":[73,111]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.2.8','robe','m',2,8,'{"defense":[25,39],"maxHp":[76,116]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.2.9','robe','m',2,9,'{"defense":[26,40],"maxHp":[80,120]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.3.1','robe','m',3,1,'{"defense":[27,41],"maxHp":[82,124]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.3.2','robe','m',3,2,'{"defense":[28,44],"maxHp":[85,129]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.3.3','robe','m',3,3,'{"defense":[29,45],"maxHp":[88,132]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.3.4','robe','m',3,4,'{"defense":[30,46],"maxHp":[91,137]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.3.5','robe','m',3,5,'{"defense":[31,47],"maxHp":[94,142]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.3.6','robe','m',3,6,'{"defense":[32,48],"maxHp":[96,146]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.3.7','robe','m',3,7,'{"defense":[33,51],"maxHp":[100,150]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.3.8','robe','m',3,8,'{"defense":[34,52],"maxHp":[102,154]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.m.3.9','robe','m',3,9,'{"defense":[35,53],"maxHp":[105,159]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.0.1','robe','f',0,1,'{"defense":[1,3],"maxHp":[4,8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.0.2','robe','f',0,2,'{"defense":[2,4],"maxHp":[8,12]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.0.3','robe','f',0,3,'{"defense":[3,5],"maxHp":[10,16]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.0.4','robe','f',0,4,'{"defense":[4,8],"maxHp":[13,21]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.0.5','robe','f',0,5,'{"defense":[5,9],"maxHp":[16,24]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.0.6','robe','f',0,6,'{"defense":[6,10],"maxHp":[19,29]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.0.7','robe','f',0,7,'{"defense":[7,11],"maxHp":[22,34]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.0.8','robe','f',0,8,'{"defense":[8,12],"maxHp":[24,38]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.0.9','robe','f',0,9,'{"defense":[9,15],"maxHp":[28,42]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.1.1','robe','f',1,1,'{"defense":[10,16],"maxHp":[30,46]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.1.2','robe','f',1,2,'{"defense":[11,17],"maxHp":[33,51]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.1.3','robe','f',1,3,'{"defense":[12,18],"maxHp":[36,56]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.1.4','robe','f',1,4,'{"defense":[12,20],"maxHp":[39,59]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.1.5','robe','f',1,5,'{"defense":[14,22],"maxHp":[42,64]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.1.6','robe','f',1,6,'{"defense":[15,23],"maxHp":[44,68]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.1.7','robe','f',1,7,'{"defense":[16,24],"maxHp":[48,72]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.1.8','robe','f',1,8,'{"defense":[16,26],"maxHp":[51,77]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.1.9','robe','f',1,9,'{"defense":[17,27],"maxHp":[53,81]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.2.1','robe','f',2,1,'{"defense":[19,29],"maxHp":[56,86]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.2.2','robe','f',2,2,'{"defense":[20,30],"maxHp":[59,89]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.2.3','robe','f',2,3,'{"defense":[20,32],"maxHp":[62,94]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.2.4','robe','f',2,4,'{"defense":[21,33],"maxHp":[65,99]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.2.5','robe','f',2,5,'{"defense":[22,34],"maxHp":[68,102]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.2.6','robe','f',2,6,'{"defense":[24,36],"maxHp":[71,107]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.2.7','robe','f',2,7,'{"defense":[24,38],"maxHp":[73,111]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.2.8','robe','f',2,8,'{"defense":[25,39],"maxHp":[76,116]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.2.9','robe','f',2,9,'{"defense":[26,40],"maxHp":[80,120]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.3.1','robe','f',3,1,'{"defense":[27,41],"maxHp":[82,124]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.3.2','robe','f',3,2,'{"defense":[28,44],"maxHp":[85,129]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.3.3','robe','f',3,3,'{"defense":[29,45],"maxHp":[88,132]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.3.4','robe','f',3,4,'{"defense":[30,46],"maxHp":[91,137]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.3.5','robe','f',3,5,'{"defense":[31,47],"maxHp":[94,142]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.3.6','robe','f',3,6,'{"defense":[32,48],"maxHp":[96,146]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.3.7','robe','f',3,7,'{"defense":[33,51],"maxHp":[100,150]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.3.8','robe','f',3,8,'{"defense":[34,52],"maxHp":[102,154]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('robe.f.3.9','robe','f',3,9,'{"defense":[35,53],"maxHp":[105,159]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.0.1','bracer','m',0,1,'{"attack":[1,2],"defense":[1,2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.0.2','bracer','m',0,2,'{"attack":[1,3],"defense":[1,3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.0.3','bracer','m',0,3,'{"attack":[1,3],"defense":[1,3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.0.4','bracer','m',0,4,'{"attack":[2,4],"defense":[2,4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.0.5','bracer','m',0,5,'{"attack":[2,4],"defense":[2,4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.0.6','bracer','m',0,6,'{"attack":[3,5],"defense":[3,5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.0.7','bracer','m',0,7,'{"attack":[4,6],"defense":[4,6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.0.8','bracer','m',0,8,'{"attack":[4,6],"defense":[4,6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.0.9','bracer','m',0,9,'{"attack":[4,8],"defense":[4,8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.1.1','bracer','m',1,1,'{"attack":[4,8],"defense":[4,8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.1.2','bracer','m',1,2,'{"attack":[5,9],"defense":[5,9]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.1.3','bracer','m',1,3,'{"attack":[6,10],"defense":[6,10]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.1.4','bracer','m',1,4,'{"attack":[6,10],"defense":[6,10]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.1.5','bracer','m',1,5,'{"attack":[7,11],"defense":[7,11]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.1.6','bracer','m',1,6,'{"attack":[7,11],"defense":[7,11]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.1.7','bracer','m',1,7,'{"attack":[8,12],"defense":[8,12]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.1.8','bracer','m',1,8,'{"attack":[8,14],"defense":[8,14]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.1.9','bracer','m',1,9,'{"attack":[8,14],"defense":[8,14]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.2.1','bracer','m',2,1,'{"attack":[9,15],"defense":[9,15]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.2.2','bracer','m',2,2,'{"attack":[9,15],"defense":[9,15]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.2.3','bracer','m',2,3,'{"attack":[10,16],"defense":[10,16]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.2.4','bracer','m',2,4,'{"attack":[11,17],"defense":[11,17]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.2.5','bracer','m',2,5,'{"attack":[11,17],"defense":[11,17]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.2.6','bracer','m',2,6,'{"attack":[12,18],"defense":[12,18]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.2.7','bracer','m',2,7,'{"attack":[12,18],"defense":[12,18]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.2.8','bracer','m',2,8,'{"attack":[12,20],"defense":[12,20]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.2.9','bracer','m',2,9,'{"attack":[13,21],"defense":[13,21]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.3.1','bracer','m',3,1,'{"attack":[13,21],"defense":[13,21]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.3.2','bracer','m',3,2,'{"attack":[14,22],"defense":[14,22]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.3.3','bracer','m',3,3,'{"attack":[14,22],"defense":[14,22]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.3.4','bracer','m',3,4,'{"attack":[15,23],"defense":[15,23]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.3.5','bracer','m',3,5,'{"attack":[16,24],"defense":[16,24]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.3.6','bracer','m',3,6,'{"attack":[16,24],"defense":[16,24]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.3.7','bracer','m',3,7,'{"attack":[16,26],"defense":[16,26]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.3.8','bracer','m',3,8,'{"attack":[16,26],"defense":[16,26]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.m.3.9','bracer','m',3,9,'{"attack":[17,27],"defense":[17,27]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.0.1','bracer','f',0,1,'{"attack":[1,2],"defense":[1,2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.0.2','bracer','f',0,2,'{"attack":[1,3],"defense":[1,3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.0.3','bracer','f',0,3,'{"attack":[1,3],"defense":[1,3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.0.4','bracer','f',0,4,'{"attack":[2,4],"defense":[2,4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.0.5','bracer','f',0,5,'{"attack":[2,4],"defense":[2,4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.0.6','bracer','f',0,6,'{"attack":[3,5],"defense":[3,5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.0.7','bracer','f',0,7,'{"attack":[4,6],"defense":[4,6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.0.8','bracer','f',0,8,'{"attack":[4,6],"defense":[4,6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.0.9','bracer','f',0,9,'{"attack":[4,8],"defense":[4,8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.1.1','bracer','f',1,1,'{"attack":[4,8],"defense":[4,8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.1.2','bracer','f',1,2,'{"attack":[5,9],"defense":[5,9]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.1.3','bracer','f',1,3,'{"attack":[6,10],"defense":[6,10]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.1.4','bracer','f',1,4,'{"attack":[6,10],"defense":[6,10]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.1.5','bracer','f',1,5,'{"attack":[7,11],"defense":[7,11]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.1.6','bracer','f',1,6,'{"attack":[7,11],"defense":[7,11]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.1.7','bracer','f',1,7,'{"attack":[8,12],"defense":[8,12]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.1.8','bracer','f',1,8,'{"attack":[8,14],"defense":[8,14]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.1.9','bracer','f',1,9,'{"attack":[8,14],"defense":[8,14]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.2.1','bracer','f',2,1,'{"attack":[9,15],"defense":[9,15]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.2.2','bracer','f',2,2,'{"attack":[9,15],"defense":[9,15]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.2.3','bracer','f',2,3,'{"attack":[10,16],"defense":[10,16]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.2.4','bracer','f',2,4,'{"attack":[11,17],"defense":[11,17]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.2.5','bracer','f',2,5,'{"attack":[11,17],"defense":[11,17]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.2.6','bracer','f',2,6,'{"attack":[12,18],"defense":[12,18]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.2.7','bracer','f',2,7,'{"attack":[12,18],"defense":[12,18]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.2.8','bracer','f',2,8,'{"attack":[12,20],"defense":[12,20]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.2.9','bracer','f',2,9,'{"attack":[13,21],"defense":[13,21]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.3.1','bracer','f',3,1,'{"attack":[13,21],"defense":[13,21]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.3.2','bracer','f',3,2,'{"attack":[14,22],"defense":[14,22]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.3.3','bracer','f',3,3,'{"attack":[14,22],"defense":[14,22]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.3.4','bracer','f',3,4,'{"attack":[15,23],"defense":[15,23]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.3.5','bracer','f',3,5,'{"attack":[16,24],"defense":[16,24]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.3.6','bracer','f',3,6,'{"attack":[16,24],"defense":[16,24]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.3.7','bracer','f',3,7,'{"attack":[16,26],"defense":[16,26]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.3.8','bracer','f',3,8,'{"attack":[16,26],"defense":[16,26]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('bracer.f.3.9','bracer','f',3,9,'{"attack":[17,27],"defense":[17,27]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.0.1','ring','u',0,1,'{"attack":[1,2],"critRate":[0.2,0.2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.0.2','ring','u',0,2,'{"attack":[1,3],"critRate":[0.2,0.2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.0.3','ring','u',0,3,'{"attack":[1,3],"critRate":[0.2,0.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.0.4','ring','u',0,4,'{"attack":[2,4],"critRate":[0.3,0.5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.0.5','ring','u',0,5,'{"attack":[2,4],"critRate":[0.4,0.6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.0.6','ring','u',0,6,'{"attack":[3,5],"critRate":[0.5,0.7]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.0.7','ring','u',0,7,'{"attack":[4,6],"critRate":[0.6,0.8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.0.8','ring','u',0,8,'{"attack":[4,6],"critRate":[0.6,1]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.0.9','ring','u',0,9,'{"attack":[4,8],"critRate":[0.7,1.1]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.1.1','ring','u',1,1,'{"attack":[4,8],"critRate":[0.8,1.2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.1.2','ring','u',1,2,'{"attack":[5,9],"critRate":[0.9,1.3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.1.3','ring','u',1,3,'{"attack":[6,10],"critRate":[0.9,1.3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.1.4','ring','u',1,4,'{"attack":[6,10],"critRate":[1,1.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.1.5','ring','u',1,5,'{"attack":[7,11],"critRate":[1,1.6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.1.6','ring','u',1,6,'{"attack":[7,11],"critRate":[1.1,1.7]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.1.7','ring','u',1,7,'{"attack":[8,12],"critRate":[1.2,1.8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.1.8','ring','u',1,8,'{"attack":[8,14],"critRate":[1.3,1.9]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.1.9','ring','u',1,9,'{"attack":[8,14],"critRate":[1.4,2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.2.1','ring','u',2,1,'{"attack":[9,15],"critRate":[1.4,2.2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.2.2','ring','u',2,2,'{"attack":[9,15],"critRate":[1.5,2.3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.2.3','ring','u',2,3,'{"attack":[10,16],"critRate":[1.6,2.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.2.4','ring','u',2,4,'{"attack":[11,17],"critRate":[1.6,2.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.2.5','ring','u',2,5,'{"attack":[11,17],"critRate":[1.7,2.5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.2.6','ring','u',2,6,'{"attack":[12,18],"critRate":[1.8,2.6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.2.7','ring','u',2,7,'{"attack":[12,18],"critRate":[1.8,2.8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.2.8','ring','u',2,8,'{"attack":[12,20],"critRate":[1.9,2.9]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.2.9','ring','u',2,9,'{"attack":[13,21],"critRate":[2,3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.3.1','ring','u',3,1,'{"attack":[13,21],"critRate":[2.1,3.1]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.3.2','ring','u',3,2,'{"attack":[14,22],"critRate":[2.2,3.2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.3.3','ring','u',3,3,'{"attack":[14,22],"critRate":[2.2,3.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.3.4','ring','u',3,4,'{"attack":[15,23],"critRate":[2.3,3.5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.3.5','ring','u',3,5,'{"attack":[16,24],"critRate":[2.3,3.5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.3.6','ring','u',3,6,'{"attack":[16,24],"critRate":[2.4,3.6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.3.7','ring','u',3,7,'{"attack":[16,26],"critRate":[2.5,3.7]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.3.8','ring','u',3,8,'{"attack":[16,26],"critRate":[2.6,3.8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('ring.u.3.9','ring','u',3,9,'{"attack":[17,27],"critRate":[2.6,4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.0.1','jade','m',0,1,'{"maxHp":[4,6],"dodgeRate":[0.1,0.1]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.0.2','jade','m',0,2,'{"maxHp":[6,10],"dodgeRate":[0.2,0.2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.0.3','jade','m',0,3,'{"maxHp":[8,14],"dodgeRate":[0.2,0.2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.0.4','jade','m',0,4,'{"maxHp":[11,17],"dodgeRate":[0.2,0.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.0.5','jade','m',0,5,'{"maxHp":[13,21],"dodgeRate":[0.2,0.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.0.6','jade','m',0,6,'{"maxHp":[16,24],"dodgeRate":[0.3,0.5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.0.7','jade','m',0,7,'{"maxHp":[18,28],"dodgeRate":[0.4,0.6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.0.8','jade','m',0,8,'{"maxHp":[20,32],"dodgeRate":[0.4,0.6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.0.9','jade','m',0,9,'{"maxHp":[23,35],"dodgeRate":[0.5,0.7]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.1.1','jade','m',1,1,'{"maxHp":[25,39],"dodgeRate":[0.5,0.7]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.1.2','jade','m',1,2,'{"maxHp":[28,42],"dodgeRate":[0.6,0.8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.1.3','jade','m',1,3,'{"maxHp":[30,46],"dodgeRate":[0.6,1]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.1.4','jade','m',1,4,'{"maxHp":[32,50],"dodgeRate":[0.6,1]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.1.5','jade','m',1,5,'{"maxHp":[35,53],"dodgeRate":[0.7,1.1]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.1.6','jade','m',1,6,'{"maxHp":[37,57],"dodgeRate":[0.7,1.1]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.1.7','jade','m',1,7,'{"maxHp":[40,60],"dodgeRate":[0.8,1.2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.1.8','jade','m',1,8,'{"maxHp":[42,64],"dodgeRate":[0.9,1.3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.1.9','jade','m',1,9,'{"maxHp":[44,68],"dodgeRate":[0.9,1.3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.2.1','jade','m',2,1,'{"maxHp":[47,71],"dodgeRate":[1,1.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.2.2','jade','m',2,2,'{"maxHp":[49,75],"dodgeRate":[1,1.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.2.3','jade','m',2,3,'{"maxHp":[52,78],"dodgeRate":[1,1.6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.2.4','jade','m',2,4,'{"maxHp":[54,82],"dodgeRate":[1.1,1.7]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.2.5','jade','m',2,5,'{"maxHp":[56,86],"dodgeRate":[1.1,1.7]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.2.6','jade','m',2,6,'{"maxHp":[59,89],"dodgeRate":[1.2,1.8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.2.7','jade','m',2,7,'{"maxHp":[61,93],"dodgeRate":[1.2,1.8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.2.8','jade','m',2,8,'{"maxHp":[64,96],"dodgeRate":[1.3,1.9]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.2.9','jade','m',2,9,'{"maxHp":[66,100],"dodgeRate":[1.4,2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.3.1','jade','m',3,1,'{"maxHp":[68,104],"dodgeRate":[1.4,2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.3.2','jade','m',3,2,'{"maxHp":[71,107],"dodgeRate":[1.4,2.2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.3.3','jade','m',3,3,'{"maxHp":[73,111],"dodgeRate":[1.4,2.2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.3.4','jade','m',3,4,'{"maxHp":[76,114],"dodgeRate":[1.5,2.3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.3.5','jade','m',3,5,'{"maxHp":[78,118],"dodgeRate":[1.6,2.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.3.6','jade','m',3,6,'{"maxHp":[80,122],"dodgeRate":[1.6,2.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.3.7','jade','m',3,7,'{"maxHp":[83,125],"dodgeRate":[1.7,2.5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.3.8','jade','m',3,8,'{"maxHp":[85,129],"dodgeRate":[1.7,2.5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.m.3.9','jade','m',3,9,'{"maxHp":[88,132],"dodgeRate":[1.8,2.6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.0.1','jade','f',0,1,'{"maxHp":[4,6],"dodgeRate":[0.1,0.1]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.0.2','jade','f',0,2,'{"maxHp":[6,10],"dodgeRate":[0.2,0.2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.0.3','jade','f',0,3,'{"maxHp":[8,14],"dodgeRate":[0.2,0.2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.0.4','jade','f',0,4,'{"maxHp":[11,17],"dodgeRate":[0.2,0.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.0.5','jade','f',0,5,'{"maxHp":[13,21],"dodgeRate":[0.2,0.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.0.6','jade','f',0,6,'{"maxHp":[16,24],"dodgeRate":[0.3,0.5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.0.7','jade','f',0,7,'{"maxHp":[18,28],"dodgeRate":[0.4,0.6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.0.8','jade','f',0,8,'{"maxHp":[20,32],"dodgeRate":[0.4,0.6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.0.9','jade','f',0,9,'{"maxHp":[23,35],"dodgeRate":[0.5,0.7]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.1.1','jade','f',1,1,'{"maxHp":[25,39],"dodgeRate":[0.5,0.7]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.1.2','jade','f',1,2,'{"maxHp":[28,42],"dodgeRate":[0.6,0.8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.1.3','jade','f',1,3,'{"maxHp":[30,46],"dodgeRate":[0.6,1]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.1.4','jade','f',1,4,'{"maxHp":[32,50],"dodgeRate":[0.6,1]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.1.5','jade','f',1,5,'{"maxHp":[35,53],"dodgeRate":[0.7,1.1]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.1.6','jade','f',1,6,'{"maxHp":[37,57],"dodgeRate":[0.7,1.1]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.1.7','jade','f',1,7,'{"maxHp":[40,60],"dodgeRate":[0.8,1.2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.1.8','jade','f',1,8,'{"maxHp":[42,64],"dodgeRate":[0.9,1.3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.1.9','jade','f',1,9,'{"maxHp":[44,68],"dodgeRate":[0.9,1.3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.2.1','jade','f',2,1,'{"maxHp":[47,71],"dodgeRate":[1,1.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.2.2','jade','f',2,2,'{"maxHp":[49,75],"dodgeRate":[1,1.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.2.3','jade','f',2,3,'{"maxHp":[52,78],"dodgeRate":[1,1.6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.2.4','jade','f',2,4,'{"maxHp":[54,82],"dodgeRate":[1.1,1.7]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.2.5','jade','f',2,5,'{"maxHp":[56,86],"dodgeRate":[1.1,1.7]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.2.6','jade','f',2,6,'{"maxHp":[59,89],"dodgeRate":[1.2,1.8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.2.7','jade','f',2,7,'{"maxHp":[61,93],"dodgeRate":[1.2,1.8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.2.8','jade','f',2,8,'{"maxHp":[64,96],"dodgeRate":[1.3,1.9]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.2.9','jade','f',2,9,'{"maxHp":[66,100],"dodgeRate":[1.4,2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.3.1','jade','f',3,1,'{"maxHp":[68,104],"dodgeRate":[1.4,2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.3.2','jade','f',3,2,'{"maxHp":[71,107],"dodgeRate":[1.4,2.2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.3.3','jade','f',3,3,'{"maxHp":[73,111],"dodgeRate":[1.4,2.2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.3.4','jade','f',3,4,'{"maxHp":[76,114],"dodgeRate":[1.5,2.3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.3.5','jade','f',3,5,'{"maxHp":[78,118],"dodgeRate":[1.6,2.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.3.6','jade','f',3,6,'{"maxHp":[80,122],"dodgeRate":[1.6,2.4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.3.7','jade','f',3,7,'{"maxHp":[83,125],"dodgeRate":[1.7,2.5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.3.8','jade','f',3,8,'{"maxHp":[85,129],"dodgeRate":[1.7,2.5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('jade.f.3.9','jade','f',3,9,'{"maxHp":[88,132],"dodgeRate":[1.8,2.6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.0.1','necklace','m',0,1,'{"defense":[1,2],"maxHp":[4,6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.0.2','necklace','m',0,2,'{"defense":[1,2],"maxHp":[6,10]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.0.3','necklace','m',0,3,'{"defense":[1,3],"maxHp":[8,14]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.0.4','necklace','m',0,4,'{"defense":[1,3],"maxHp":[11,17]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.0.5','necklace','m',0,5,'{"defense":[2,4],"maxHp":[13,21]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.0.6','necklace','m',0,6,'{"defense":[2,4],"maxHp":[16,24]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.0.7','necklace','m',0,7,'{"defense":[3,5],"maxHp":[18,28]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.0.8','necklace','m',0,8,'{"defense":[3,5],"maxHp":[20,32]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.0.9','necklace','m',0,9,'{"defense":[4,6],"maxHp":[23,35]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.1.1','necklace','m',1,1,'{"defense":[4,6],"maxHp":[25,39]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.1.2','necklace','m',1,2,'{"defense":[4,8],"maxHp":[28,42]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.1.3','necklace','m',1,3,'{"defense":[4,8],"maxHp":[30,46]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.1.4','necklace','m',1,4,'{"defense":[5,9],"maxHp":[32,50]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.1.5','necklace','m',1,5,'{"defense":[5,9],"maxHp":[35,53]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.1.6','necklace','m',1,6,'{"defense":[6,10],"maxHp":[37,57]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.1.7','necklace','m',1,7,'{"defense":[6,10],"maxHp":[40,60]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.1.8','necklace','m',1,8,'{"defense":[6,10],"maxHp":[42,64]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.1.9','necklace','m',1,9,'{"defense":[7,11],"maxHp":[44,68]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.2.1','necklace','m',2,1,'{"defense":[7,11],"maxHp":[47,71]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.2.2','necklace','m',2,2,'{"defense":[8,12],"maxHp":[49,75]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.2.3','necklace','m',2,3,'{"defense":[8,12],"maxHp":[52,78]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.2.4','necklace','m',2,4,'{"defense":[8,14],"maxHp":[54,82]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.2.5','necklace','m',2,5,'{"defense":[8,14],"maxHp":[56,86]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.2.6','necklace','m',2,6,'{"defense":[9,15],"maxHp":[59,89]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.2.7','necklace','m',2,7,'{"defense":[9,15],"maxHp":[61,93]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.2.8','necklace','m',2,8,'{"defense":[10,16],"maxHp":[64,96]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.2.9','necklace','m',2,9,'{"defense":[10,16],"maxHp":[66,100]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.3.1','necklace','m',3,1,'{"defense":[11,17],"maxHp":[68,104]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.3.2','necklace','m',3,2,'{"defense":[11,17],"maxHp":[71,107]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.3.3','necklace','m',3,3,'{"defense":[12,18],"maxHp":[73,111]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.3.4','necklace','m',3,4,'{"defense":[12,18],"maxHp":[76,114]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.3.5','necklace','m',3,5,'{"defense":[12,20],"maxHp":[78,118]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.3.6','necklace','m',3,6,'{"defense":[12,20],"maxHp":[80,122]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.3.7','necklace','m',3,7,'{"defense":[13,21],"maxHp":[83,125]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.3.8','necklace','m',3,8,'{"defense":[13,21],"maxHp":[85,129]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.m.3.9','necklace','m',3,9,'{"defense":[14,22],"maxHp":[88,132]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.0.1','necklace','f',0,1,'{"defense":[1,2],"maxHp":[4,6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.0.2','necklace','f',0,2,'{"defense":[1,2],"maxHp":[6,10]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.0.3','necklace','f',0,3,'{"defense":[1,3],"maxHp":[8,14]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.0.4','necklace','f',0,4,'{"defense":[1,3],"maxHp":[11,17]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.0.5','necklace','f',0,5,'{"defense":[2,4],"maxHp":[13,21]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.0.6','necklace','f',0,6,'{"defense":[2,4],"maxHp":[16,24]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.0.7','necklace','f',0,7,'{"defense":[3,5],"maxHp":[18,28]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.0.8','necklace','f',0,8,'{"defense":[3,5],"maxHp":[20,32]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.0.9','necklace','f',0,9,'{"defense":[4,6],"maxHp":[23,35]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.1.1','necklace','f',1,1,'{"defense":[4,6],"maxHp":[25,39]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.1.2','necklace','f',1,2,'{"defense":[4,8],"maxHp":[28,42]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.1.3','necklace','f',1,3,'{"defense":[4,8],"maxHp":[30,46]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.1.4','necklace','f',1,4,'{"defense":[5,9],"maxHp":[32,50]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.1.5','necklace','f',1,5,'{"defense":[5,9],"maxHp":[35,53]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.1.6','necklace','f',1,6,'{"defense":[6,10],"maxHp":[37,57]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.1.7','necklace','f',1,7,'{"defense":[6,10],"maxHp":[40,60]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.1.8','necklace','f',1,8,'{"defense":[6,10],"maxHp":[42,64]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.1.9','necklace','f',1,9,'{"defense":[7,11],"maxHp":[44,68]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.2.1','necklace','f',2,1,'{"defense":[7,11],"maxHp":[47,71]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.2.2','necklace','f',2,2,'{"defense":[8,12],"maxHp":[49,75]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.2.3','necklace','f',2,3,'{"defense":[8,12],"maxHp":[52,78]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.2.4','necklace','f',2,4,'{"defense":[8,14],"maxHp":[54,82]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.2.5','necklace','f',2,5,'{"defense":[8,14],"maxHp":[56,86]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.2.6','necklace','f',2,6,'{"defense":[9,15],"maxHp":[59,89]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.2.7','necklace','f',2,7,'{"defense":[9,15],"maxHp":[61,93]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.2.8','necklace','f',2,8,'{"defense":[10,16],"maxHp":[64,96]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.2.9','necklace','f',2,9,'{"defense":[10,16],"maxHp":[66,100]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.3.1','necklace','f',3,1,'{"defense":[11,17],"maxHp":[68,104]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.3.2','necklace','f',3,2,'{"defense":[11,17],"maxHp":[71,107]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.3.3','necklace','f',3,3,'{"defense":[12,18],"maxHp":[73,111]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.3.4','necklace','f',3,4,'{"defense":[12,18],"maxHp":[76,114]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.3.5','necklace','f',3,5,'{"defense":[12,20],"maxHp":[78,118]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.3.6','necklace','f',3,6,'{"defense":[12,20],"maxHp":[80,122]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.3.7','necklace','f',3,7,'{"defense":[13,21],"maxHp":[83,125]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.3.8','necklace','f',3,8,'{"defense":[13,21],"maxHp":[85,129]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('necklace.f.3.9','necklace','f',3,9,'{"defense":[14,22],"maxHp":[88,132]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.0.1','belt','u',0,1,'{"defense":[1,3],"maxHp":[2,4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.0.2','belt','u',0,2,'{"defense":[1,3],"maxHp":[4,6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.0.3','belt','u',0,3,'{"defense":[2,4],"maxHp":[5,9]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.0.4','belt','u',0,4,'{"defense":[3,5],"maxHp":[6,10]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.0.5','belt','u',0,5,'{"defense":[4,6],"maxHp":[8,12]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.0.6','belt','u',0,6,'{"defense":[4,8],"maxHp":[9,15]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.0.7','belt','u',0,7,'{"defense":[5,9],"maxHp":[11,17]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.0.8','belt','u',0,8,'{"defense":[6,10],"maxHp":[12,20]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.0.9','belt','u',0,9,'{"defense":[7,11],"maxHp":[13,21]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.1.1','belt','u',1,1,'{"defense":[8,12],"maxHp":[15,23]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.1.2','belt','u',1,2,'{"defense":[8,14],"maxHp":[16,26]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.1.3','belt','u',1,3,'{"defense":[8,14],"maxHp":[18,28]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.1.4','belt','u',1,4,'{"defense":[9,15],"maxHp":[20,30]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.1.5','belt','u',1,5,'{"defense":[10,16],"maxHp":[20,32]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.1.6','belt','u',1,6,'{"defense":[11,17],"maxHp":[22,34]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.1.7','belt','u',1,7,'{"defense":[12,18],"maxHp":[24,36]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.1.8','belt','u',1,8,'{"defense":[12,20],"maxHp":[25,39]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.1.9','belt','u',1,9,'{"defense":[13,21],"maxHp":[27,41]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.2.1','belt','u',2,1,'{"defense":[14,22],"maxHp":[28,42]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.2.2','belt','u',2,2,'{"defense":[15,23],"maxHp":[29,45]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.2.3','belt','u',2,3,'{"defense":[16,24],"maxHp":[31,47]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.2.4','belt','u',2,4,'{"defense":[16,24],"maxHp":[32,50]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.2.5','belt','u',2,5,'{"defense":[16,26],"maxHp":[34,52]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.2.6','belt','u',2,6,'{"defense":[17,27],"maxHp":[35,53]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.2.7','belt','u',2,7,'{"defense":[18,28],"maxHp":[36,56]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.2.8','belt','u',2,8,'{"defense":[19,29],"maxHp":[38,58]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.2.9','belt','u',2,9,'{"defense":[20,30],"maxHp":[40,60]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.3.1','belt','u',3,1,'{"defense":[20,32],"maxHp":[41,63]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.3.2','belt','u',3,2,'{"defense":[21,33],"maxHp":[42,64]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.3.3','belt','u',3,3,'{"defense":[22,34],"maxHp":[44,66]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.3.4','belt','u',3,4,'{"defense":[23,35],"maxHp":[45,69]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.3.5','belt','u',3,5,'{"defense":[23,35],"maxHp":[47,71]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.3.6','belt','u',3,6,'{"defense":[24,36],"maxHp":[48,74]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.3.7','belt','u',3,7,'{"defense":[24,38],"maxHp":[49,75]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.3.8','belt','u',3,8,'{"defense":[25,39],"maxHp":[51,77]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('belt.u.3.9','belt','u',3,9,'{"defense":[26,40],"maxHp":[52,80]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.0.1','boots','u',0,1,'{"defense":[1,2],"moveSpeed":[10,20]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.0.2','boots','u',0,2,'{"defense":[1,2],"moveSpeed":[10,20]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.0.3','boots','u',0,3,'{"defense":[1,3],"moveSpeed":[10,20]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.0.4','boots','u',0,4,'{"defense":[1,3],"moveSpeed":[10,20]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.0.5','boots','u',0,5,'{"defense":[2,4],"moveSpeed":[10,20]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.0.6','boots','u',0,6,'{"defense":[2,4],"moveSpeed":[10,20]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.0.7','boots','u',0,7,'{"defense":[3,5],"moveSpeed":[10,20]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.0.8','boots','u',0,8,'{"defense":[3,5],"moveSpeed":[10,20]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.0.9','boots','u',0,9,'{"defense":[4,6],"moveSpeed":[10,20]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.1.1','boots','u',1,1,'{"defense":[4,6],"moveSpeed":[15,25]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.1.2','boots','u',1,2,'{"defense":[4,8],"moveSpeed":[15,25]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.1.3','boots','u',1,3,'{"defense":[4,8],"moveSpeed":[15,25]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.1.4','boots','u',1,4,'{"defense":[5,9],"moveSpeed":[15,25]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.1.5','boots','u',1,5,'{"defense":[5,9],"moveSpeed":[15,25]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.1.6','boots','u',1,6,'{"defense":[6,10],"moveSpeed":[15,25]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.1.7','boots','u',1,7,'{"defense":[6,10],"moveSpeed":[15,25]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.1.8','boots','u',1,8,'{"defense":[6,10],"moveSpeed":[15,25]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.1.9','boots','u',1,9,'{"defense":[7,11],"moveSpeed":[15,25]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.2.1','boots','u',2,1,'{"defense":[7,11],"moveSpeed":[20,30]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.2.2','boots','u',2,2,'{"defense":[8,12],"moveSpeed":[20,30]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.2.3','boots','u',2,3,'{"defense":[8,12],"moveSpeed":[20,30]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.2.4','boots','u',2,4,'{"defense":[8,14],"moveSpeed":[20,30]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.2.5','boots','u',2,5,'{"defense":[8,14],"moveSpeed":[20,30]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.2.6','boots','u',2,6,'{"defense":[9,15],"moveSpeed":[20,30]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.2.7','boots','u',2,7,'{"defense":[9,15],"moveSpeed":[20,30]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.2.8','boots','u',2,8,'{"defense":[10,16],"moveSpeed":[20,30]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.2.9','boots','u',2,9,'{"defense":[10,16],"moveSpeed":[20,30]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.3.1','boots','u',3,1,'{"defense":[11,17],"moveSpeed":[30,40]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.3.2','boots','u',3,2,'{"defense":[11,17],"moveSpeed":[30,40]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.3.3','boots','u',3,3,'{"defense":[12,18],"moveSpeed":[30,40]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.3.4','boots','u',3,4,'{"defense":[12,18],"moveSpeed":[30,40]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.3.5','boots','u',3,5,'{"defense":[12,20],"moveSpeed":[30,40]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.3.6','boots','u',3,6,'{"defense":[12,20],"moveSpeed":[30,40]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.3.7','boots','u',3,7,'{"defense":[13,21],"moveSpeed":[30,40]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.3.8','boots','u',3,8,'{"defense":[13,21],"moveSpeed":[30,40]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('boots.u.3.9','boots','u',3,9,'{"defense":[14,22],"moveSpeed":[30,40]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.0.1','charm','u',0,1,'{"attack":[1,3],"defense":[1,2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.0.2','charm','u',0,2,'{"attack":[1,3],"defense":[1,2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.0.3','charm','u',0,3,'{"attack":[2,4],"defense":[1,2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.0.4','charm','u',0,4,'{"attack":[3,5],"defense":[1,2]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.0.5','charm','u',0,5,'{"attack":[4,6],"defense":[1,3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.0.6','charm','u',0,6,'{"attack":[4,8],"defense":[1,3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.0.7','charm','u',0,7,'{"attack":[5,9],"defense":[1,3]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.0.8','charm','u',0,8,'{"attack":[6,10],"defense":[2,4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.0.9','charm','u',0,9,'{"attack":[7,11],"defense":[2,4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.1.1','charm','u',1,1,'{"attack":[8,12],"defense":[2,4]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.1.2','charm','u',1,2,'{"attack":[8,14],"defense":[3,5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.1.3','charm','u',1,3,'{"attack":[8,14],"defense":[3,5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.1.4','charm','u',1,4,'{"attack":[9,15],"defense":[3,5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.1.5','charm','u',1,5,'{"attack":[10,16],"defense":[3,5]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.1.6','charm','u',1,6,'{"attack":[11,17],"defense":[4,6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.1.7','charm','u',1,7,'{"attack":[12,18],"defense":[4,6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.1.8','charm','u',1,8,'{"attack":[12,20],"defense":[4,6]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.1.9','charm','u',1,9,'{"attack":[13,21],"defense":[4,8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.2.1','charm','u',2,1,'{"attack":[14,22],"defense":[4,8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.2.2','charm','u',2,2,'{"attack":[15,23],"defense":[4,8]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.2.3','charm','u',2,3,'{"attack":[16,24],"defense":[5,9]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.2.4','charm','u',2,4,'{"attack":[16,24],"defense":[5,9]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.2.5','charm','u',2,5,'{"attack":[16,26],"defense":[5,9]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.2.6','charm','u',2,6,'{"attack":[17,27],"defense":[5,9]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.2.7','charm','u',2,7,'{"attack":[18,28],"defense":[6,10]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.2.8','charm','u',2,8,'{"attack":[19,29],"defense":[6,10]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.2.9','charm','u',2,9,'{"attack":[20,30],"defense":[6,10]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.3.1','charm','u',3,1,'{"attack":[20,32],"defense":[7,11]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.3.2','charm','u',3,2,'{"attack":[21,33],"defense":[7,11]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.3.3','charm','u',3,3,'{"attack":[22,34],"defense":[7,11]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.3.4','charm','u',3,4,'{"attack":[23,35],"defense":[8,12]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.3.5','charm','u',3,5,'{"attack":[23,35],"defense":[8,12]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.3.6','charm','u',3,6,'{"attack":[24,36],"defense":[8,12]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.3.7','charm','u',3,7,'{"attack":[24,38],"defense":[8,12]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.3.8','charm','u',3,8,'{"attack":[25,39],"defense":[8,14]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('charm.u.3.9','charm','u',3,9,'{"attack":[26,40],"defense":[8,14]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.0.1','flight','u',0,1,'{"moveSpeed":[40,60]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.0.2','flight','u',0,2,'{"moveSpeed":[40,60]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.0.3','flight','u',0,3,'{"moveSpeed":[40,60]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.0.4','flight','u',0,4,'{"moveSpeed":[40,60]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.0.5','flight','u',0,5,'{"moveSpeed":[40,60]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.0.6','flight','u',0,6,'{"moveSpeed":[40,60]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.0.7','flight','u',0,7,'{"moveSpeed":[40,60]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.0.8','flight','u',0,8,'{"moveSpeed":[40,60]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.0.9','flight','u',0,9,'{"moveSpeed":[40,60]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.1.1','flight','u',1,1,'{"moveSpeed":[60,80]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.1.2','flight','u',1,2,'{"moveSpeed":[60,80]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.1.3','flight','u',1,3,'{"moveSpeed":[60,80]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.1.4','flight','u',1,4,'{"moveSpeed":[60,80]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.1.5','flight','u',1,5,'{"moveSpeed":[60,80]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.1.6','flight','u',1,6,'{"moveSpeed":[60,80]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.1.7','flight','u',1,7,'{"moveSpeed":[60,80]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.1.8','flight','u',1,8,'{"moveSpeed":[60,80]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.1.9','flight','u',1,9,'{"moveSpeed":[60,80]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.2.1','flight','u',2,1,'{"moveSpeed":[80,100]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.2.2','flight','u',2,2,'{"moveSpeed":[80,100]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.2.3','flight','u',2,3,'{"moveSpeed":[80,100]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.2.4','flight','u',2,4,'{"moveSpeed":[80,100]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.2.5','flight','u',2,5,'{"moveSpeed":[80,100]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.2.6','flight','u',2,6,'{"moveSpeed":[80,100]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.2.7','flight','u',2,7,'{"moveSpeed":[80,100]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.2.8','flight','u',2,8,'{"moveSpeed":[80,100]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.2.9','flight','u',2,9,'{"moveSpeed":[80,100]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.3.1','flight','u',3,1,'{"moveSpeed":[110,150]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.3.2','flight','u',3,2,'{"moveSpeed":[110,150]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.3.3','flight','u',3,3,'{"moveSpeed":[110,150]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.3.4','flight','u',3,4,'{"moveSpeed":[110,150]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.3.5','flight','u',3,5,'{"moveSpeed":[110,150]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.3.6','flight','u',3,6,'{"moveSpeed":[110,150]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.3.7','flight','u',3,7,'{"moveSpeed":[110,150]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.3.8','flight','u',3,8,'{"moveSpeed":[110,150]}',1792735889648);
INSERT INTO "equipment_master" ("item_key","kind","style","realm","tier","stats","updated_at") VALUES('flight.u.3.9','flight','u',3,9,'{"moveSpeed":[110,150]}',1792735889648);
CREATE TABLE equipment_sets (
  realm INTEGER NOT NULL,
  tier INTEGER NOT NULL,
  name_vi TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (realm, tier)
);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(0,1,'Lăng Y',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(0,2,'Bạch Thi',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(0,3,'Thanh Phong',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(0,4,'Hắc Vân',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(0,5,'Tử Điện',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(0,6,'Xích Viêm',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(0,7,'Huyền Băng',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(0,8,'Kim Quang',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(0,9,'Linh Lung',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(1,1,'Thiên Cương',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(1,2,'Địa Sát',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(1,3,'Huyết Ảnh',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(1,4,'Ngọc Tủy',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(1,5,'Thanh Liên',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(1,6,'Hàn Nguyệt',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(1,7,'Long Lân',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(1,8,'Phượng Vũ',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(1,9,'Tinh Hà',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(2,1,'Cửu Thiên',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(2,2,'Hỗn Nguyên',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(2,3,'Tử Kim',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(2,4,'Lưu Ly',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(2,5,'Bát Hoang',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(2,6,'Thái Hư',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(2,7,'Vạn Cổ',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(2,8,'Thần Hoàng',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(2,9,'Chí Tôn',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(3,1,'Đạo Tâm',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(3,2,'Huyền Thiên',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(3,3,'Vô Cực',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(3,4,'Thái Cực',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(3,5,'Hồng Mông',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(3,6,'Âm Dương',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(3,7,'Tạo Hóa',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(3,8,'Bất Diệt',1792735889648);
INSERT INTO "equipment_sets" ("realm","tier","name_vi","updated_at") VALUES(3,9,'Thiên Đạo',1792735889648);
CREATE TABLE enhance_levels (
  level INTEGER PRIMARY KEY CHECK (level >= 1 AND level <= 10),
  success_pct REAL NOT NULL,
  stat_pct REAL NOT NULL,
  fail_bonus_pct REAL NOT NULL,
  drop_on_fail INTEGER NOT NULL,
  materials INTEGER NOT NULL,
  linh_mult REAL NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "enhance_levels" ("level","success_pct","stat_pct","fail_bonus_pct","drop_on_fail","materials","linh_mult","updated_at") VALUES(1,90,10,5,0,1,1,1792735889897);
INSERT INTO "enhance_levels" ("level","success_pct","stat_pct","fail_bonus_pct","drop_on_fail","materials","linh_mult","updated_at") VALUES(2,85,10,5,0,2,2,1792735889897);
INSERT INTO "enhance_levels" ("level","success_pct","stat_pct","fail_bonus_pct","drop_on_fail","materials","linh_mult","updated_at") VALUES(3,80,10,5,0,3,3,1792735889897);
INSERT INTO "enhance_levels" ("level","success_pct","stat_pct","fail_bonus_pct","drop_on_fail","materials","linh_mult","updated_at") VALUES(4,70,10,5,0,4,4,1792735889897);
INSERT INTO "enhance_levels" ("level","success_pct","stat_pct","fail_bonus_pct","drop_on_fail","materials","linh_mult","updated_at") VALUES(5,60,10,5,0,5,5,1792735889897);
INSERT INTO "enhance_levels" ("level","success_pct","stat_pct","fail_bonus_pct","drop_on_fail","materials","linh_mult","updated_at") VALUES(6,50,10,5,1,6,8,1792735889897);
INSERT INTO "enhance_levels" ("level","success_pct","stat_pct","fail_bonus_pct","drop_on_fail","materials","linh_mult","updated_at") VALUES(7,40,10,5,1,8,10,1792735889897);
INSERT INTO "enhance_levels" ("level","success_pct","stat_pct","fail_bonus_pct","drop_on_fail","materials","linh_mult","updated_at") VALUES(8,30,10,5,1,10,15,1792735889897);
INSERT INTO "enhance_levels" ("level","success_pct","stat_pct","fail_bonus_pct","drop_on_fail","materials","linh_mult","updated_at") VALUES(9,20,10,5,1,12,20,1792735889897);
INSERT INTO "enhance_levels" ("level","success_pct","stat_pct","fail_bonus_pct","drop_on_fail","materials","linh_mult","updated_at") VALUES(10,15,10,5,1,15,30,1792735889897);
CREATE TABLE game_tuning (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT
);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('refine','{"materials":2,"linhShare":1,"statChance":0.5}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('oreDrop','{"normal":{"chance":0.2,"min":1,"max":1},"rare1":{"chance":0.6,"min":1,"max":3},"rare2":{"chance":1,"min":2,"max":5}}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('refineDrop','{"normal":{"chance":0.04,"min":1,"max":1},"rare1":{"chance":0.15,"min":1,"max":2},"rare2":{"chance":0.4,"min":1,"max":3}}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('keepLevel','{"priceTienNgoc":50}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('enhanceCost','{"linhBase":[100,1000,10000,100000],"maxPityPct":30}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('bossCone','{"power":2.2,"cdMs":25000,"below":0.25,"range":4.5,"halfAngleDeg":45}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('bossRegen','{"perSecond":0.02}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('waygate','{"base":500,"perUnit":40}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('aoi','{"enter":{"x":52,"y":32},"leave":{"x":58,"y":36},"everyTicks":5}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('bossSpawn','{"chance":0.001,"pityKills":[500,1500,2500,4000],"pityDefault":1500,"flushEvery":25}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('bossStats','{"statTier":2,"gearGrade":4,"hpMult":25,"pointsPerLevel":2,"realmBonus":1}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('bossReward','{"minShare":0.1,"damageWeight":0.7,"lastHitWeight":0.3,"expMult":4,"linhMult":25,"itemRounds":5,"itemChanceMult":3}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('bossSkills','{"mend":{"fraction":0.04,"below":0.5,"cdMs":20000},"burst":{"power":2.6,"cdMs":10000},"slash":{"power":1.7,"cdMs":5000}}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('guard','{"gearGrade":4,"hpMult":5,"pointsPerLevel":2,"realmBonus":1,"tier":3}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('guardSkills','{"mend":{"fraction":0.25,"below":0.6,"cdMs":15000},"ward":{"attackPct":30,"durationMs":8000,"cdMs":20000},"burst":{"power":2.4,"cdMs":9000},"slash":{"power":1.6,"cdMs":5000}}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('pvp','{"satKhi":{"perKill":10,"lostOnDeath":50,"bonusAbove":200,"bonusFullAt":1000,"bonusMinPct":5,"bonusMaxPct":15},"satNhan":{"perKill":100,"decayPerMin":5,"lostOnDeath":50,"lostKillingOrange":50,"lostKillingRed":100},"dropChance":[0,0.1,0.25,0.5],"deathDurability":[0.05,0.05,0.1,0.2],"hero":{"perOrange":20,"perRed":50,"tier1":200,"tier2":500,"bonus1":{"mpPct":5,"dropPct":0},"bonus2":{"mpPct":10,"dropPct":5}},"nameTiers":{"yellowFrom":1,"orangeFrom":201,"redFrom":501},"protectedBelow":{"realm":0,"stage":5}}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('drops','{"linh":{"chance":{"normal":0.3,"rare1":1,"rare2":1},"amountMult":{"normal":1,"rare1":4,"rare2":10},"base":2,"growth":1.1},"book":{"normal":0.003,"rare1":0.03,"rare2":0.08},"pill":{"0":{"normal":0.004,"rare1":0.04,"rare2":0.12},"1":{"normal":0.0015,"rare1":0.02,"rare2":0.06},"2":{"normal":0.0005,"rare1":0.008,"rare2":0.03}},"equip":{"normal":{"chance":0.03,"grades":[70,25,5,0],"overLevel":0},"rare1":{"chance":0.15,"grades":[45,35,17,3],"overLevel":0.1},"rare2":{"chance":0.3,"grades":[25,35,30,10],"overLevel":0.25}}}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('kills','{"base":30,"growth":1.13}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('itemValue','{"items":{"hoi_huyet_dan":10,"duong_huyet_dan":25,"dai_hoi_huyet_dan":60,"ngo_dao_dan":1500,"linh_thao":3,"thu_cot":3,"yeu_dan":40,"ttp_town":2000,"ttp_town2":20000,"linh_nguyen_dan":400,"bao_nguyen_dan":1500,"thien_ngo_dan":7500},"kinds":{"weapon":40,"hat":20,"robe":30,"bracer":20,"ring":25,"jade":25,"necklace":25,"belt":20,"boots":20,"charm":60,"bonded":150,"flight":150},"grades":[1,2,4,8],"levelStep":0.6}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('skills','{"levelPower":[1,1.15,1.35,1.6,2],"levelCooldown":[1,1,1,0.9,0.8],"masteryNeeded":[50,150,400,1000],"pillPoints":100,"attackRealmScale":0.5,"healRealmScale":0.1,"buffRealmScale":0.2,"subFactor":0.5}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('theme','{"realmColors":["#8bc34a","#4fc3f7","#ffb300","#e040fb"],"gradeColors":["rgba(158, 158, 158, 0.28)","rgba(76, 175, 80, 0.3)","rgba(66, 165, 245, 0.32)","rgba(171, 71, 188, 0.34)","rgba(255, 179, 0, 0.36)"],"ui":{"ui-text":"#e8e4d8","ui-border":"#3a4560","ui-accent":"#d6a94b","ui-on-accent":"#1b1405","ui-highlight":"#ffd54a","ui-muted":"#6b7a99","ui-panel":"rgba(27, 33, 48, 0.96)","ui-page":"#10141c"}}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('monsters','{"species":{"soi_rung":{"hpMult":1,"attackMult":1,"defenseMult":1,"speed":3,"aggroRadius":5,"leashRadius":8,"attackRange":1.3,"attackCooldownMs":1500,"respawnMs":15000},"heo_rung":{"hpMult":1.6,"attackMult":1.2,"defenseMult":1.5,"speed":2.6,"aggroRadius":4,"leashRadius":8,"attackRange":1.3,"attackCooldownMs":1800,"respawnMs":20000},"bao_dem":{"hpMult":1.2,"attackMult":1.4,"defenseMult":1,"speed":3.6,"aggroRadius":6,"leashRadius":9,"attackRange":1.3,"attackCooldownMs":1300,"respawnMs":25000},"doi_u_minh":{"hpMult":1,"attackMult":1.2,"defenseMult":0.9,"speed":3.4,"aggroRadius":6,"leashRadius":8,"attackRange":1.3,"attackCooldownMs":1300,"respawnMs":15000},"thi_quy":{"hpMult":1.8,"attackMult":1.3,"defenseMult":1.6,"speed":2.2,"aggroRadius":5,"leashRadius":8,"attackRange":1.4,"attackCooldownMs":2000,"respawnMs":20000},"ve_binh":{"hpMult":3,"attackMult":2.5,"defenseMult":2,"speed":3,"aggroRadius":8,"leashRadius":12,"attackRange":1.4,"attackCooldownMs":1200,"respawnMs":60000},"huyet_lang_vuong":{"hpMult":1,"attackMult":1,"defenseMult":1,"speed":3,"aggroRadius":7,"leashRadius":12,"attackRange":1.6,"attackCooldownMs":1400,"respawnMs":0},"quy_vuong":{"hpMult":1,"attackMult":1,"defenseMult":1,"speed":2.8,"aggroRadius":7,"leashRadius":12,"attackRange":1.6,"attackCooldownMs":1500,"respawnMs":0},"hoa_dien_lang":{"hpMult":1,"attackMult":1.1,"defenseMult":1,"speed":3,"aggroRadius":6,"leashRadius":9,"attackRange":1.3,"attackCooldownMs":1400,"respawnMs":20000},"nham_giap_thu":{"hpMult":1.8,"attackMult":1.2,"defenseMult":1.7,"speed":2.4,"aggroRadius":5,"leashRadius":8,"attackRange":1.4,"attackCooldownMs":1900,"respawnMs":25000},"liet_hoa_xa":{"hpMult":1.3,"attackMult":1.5,"defenseMult":1.1,"speed":3.4,"aggroRadius":6,"leashRadius":9,"attackRange":1.4,"attackCooldownMs":1300,"respawnMs":25000},"hoa_long_vuong":{"hpMult":1,"attackMult":1,"defenseMult":1,"speed":3,"aggroRadius":7,"leashRadius":12,"attackRange":1.8,"attackCooldownMs":1400,"respawnMs":0},"bang_phong_hac":{"hpMult":1,"attackMult":1.2,"defenseMult":1,"speed":3.6,"aggroRadius":7,"leashRadius":9,"attackRange":1.4,"attackCooldownMs":1300,"respawnMs":20000},"han_thi_ma":{"hpMult":1.9,"attackMult":1.3,"defenseMult":1.8,"speed":2.3,"aggroRadius":5,"leashRadius":8,"attackRange":1.5,"attackCooldownMs":2000,"respawnMs":25000},"tuyet_yeu_hau":{"hpMult":1.4,"attackMult":1.6,"defenseMult":1.2,"speed":3.2,"aggroRadius":6,"leashRadius":9,"attackRange":1.4,"attackCooldownMs":1500,"respawnMs":25000},"bang_hoang":{"hpMult":1,"attackMult":1,"defenseMult":1,"speed":3,"aggroRadius":7,"leashRadius":12,"attackRange":1.8,"attackCooldownMs":1500,"respawnMs":0},"xich_thi":{"hpMult":1.4,"attackMult":1.5,"defenseMult":1.2,"speed":2.8,"aggroRadius":5,"leashRadius":9,"attackRange":1.4,"attackCooldownMs":1700,"respawnMs":25000}},"ranks":{"normal":{"chance":0,"hpMult":1,"attackMult":1,"defenseMult":1,"expMult":1},"rare1":{"chance":0.08,"hpMult":1.8,"attackMult":1.2,"defenseMult":1.2,"expMult":2.5},"rare2":{"chance":0.02,"hpMult":3,"attackMult":1.5,"defenseMult":1.5,"expMult":5}}}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('skillOverrides','{}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('exp','{"realms":[{"expBase":1000,"pointsPerStage":5},{"expBase":20000,"pointsPerStage":6},{"expBase":400000,"pointsPerStage":8},{"expBase":8000000,"pointsPerStage":10}],"stageGrowth":1.35,"lowMapMult":1,"overflowMax":1}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('breakthrough','{"steps":[{"maxPills":2,"baseRatePct":70,"maxRatePct":90,"durationMs":60000,"cost":5000,"basePoints":10},{"maxPills":3,"baseRatePct":60,"maxRatePct":80,"durationMs":180000,"cost":50000,"basePoints":16},{"maxPills":3,"baseRatePct":50,"maxRatePct":70,"durationMs":600000,"cost":500000,"basePoints":24}],"failExpLoss":0.3,"gradePointsMult":2,"constitutionPoints":2,"overflowFrom":0.5,"overflowFromBonus":5,"overflowMaxBonus":15}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('paths','{"swapCostBase":20000,"dropCostBase":30000}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('combat','{"deathExpLoss":0.1,"hpRegenDelayMs":5000,"mpRegenPerS":0.02,"mpRegenDelayMs":5000,"grayWindowMs":180000,"deathDurabilityFraction":0.05,"monsterCurve":{"hpBase":60,"hpPerLevel":30,"attackBase":10,"attackPerLevel":3.2,"defenseBase":4,"defensePerLevel":2}}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('roots','{"grades":[{"weight":50,"expBonusPct":-10,"bonusPoints":0,"elementDamagePct":0},{"weight":30,"expBonusPct":5,"bonusPoints":1,"elementDamagePct":5},{"weight":13,"expBonusPct":15,"bonusPoints":2,"elementDamagePct":10},{"weight":5,"expBonusPct":30,"bonusPoints":4,"elementDamagePct":20},{"weight":2,"expBonusPct":50,"bonusPoints":6,"elementDamagePct":30}],"counts":[{"weight":20,"expBonusPct":10},{"weight":48,"expBonusPct":0},{"weight":25,"expBonusPct":-15},{"weight":5,"expBonusPct":-30},{"weight":2,"expBonusPct":-40}]}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('pathBonuses','{"kiem":{"attackPct":10,"defensePct":0,"maxMpPct":0,"weaponSkillPct":15,"elementSkillPct":0,"potionHealPct":0,"masteryPct":0},"thuat":{"attackPct":0,"defensePct":0,"maxMpPct":20,"weaponSkillPct":0,"elementSkillPct":12,"potionHealPct":0,"masteryPct":0},"dan":{"attackPct":0,"defensePct":8,"maxMpPct":0,"weaponSkillPct":0,"elementSkillPct":0,"potionHealPct":30,"masteryPct":25}}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('boss','{"claimTtlMs":86400000,"tier":9,"species":{"town":null,"forest":"huyet_lang_vuong","cave":"quy_vuong","town2":null,"kimdan":"hoa_long_vuong","nguyenanh":"bang_hoang"}}',1792735890120,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('loot','{"base":{"normal":[{"item":"linh_thao","chance":0.12,"min":1,"max":2},{"item":"thu_cot","chance":0.12,"min":1,"max":1},{"item":"hoi_huyet_dan","chance":0.04,"min":1,"max":1},{"item":"duong_huyet_dan","chance":0.03,"min":1,"max":1}],"rare1":[{"item":"yeu_dan","chance":0.5,"min":1,"max":1},{"item":"linh_thao","chance":0.5,"min":1,"max":3},{"item":"hoi_huyet_dan","chance":0.2,"min":1,"max":2},{"item":"duong_huyet_dan","chance":0.15,"min":1,"max":1},{"item":"ngo_dao_dan","chance":0.05,"min":1,"max":1}],"rare2":[{"item":"yeu_dan","chance":1,"min":1,"max":2},{"item":"linh_thao","chance":0.8,"min":2,"max":4},{"item":"hoi_huyet_dan","chance":0.5,"min":1,"max":3},{"item":"duong_huyet_dan","chance":0.4,"min":1,"max":2},{"item":"ngo_dao_dan","chance":0.25,"min":1,"max":1}]},"realm":{"2":{"normal":[{"item":"linh_nguyen_dan","chance":0.03,"min":1,"max":1}],"rare1":[{"item":"linh_nguyen_dan","chance":0.15,"min":1,"max":2},{"item":"bao_nguyen_dan","chance":0.03,"min":1,"max":1},{"item":"thien_ngo_dan","chance":0.04,"min":1,"max":1}],"rare2":[{"item":"linh_nguyen_dan","chance":0.4,"min":1,"max":3},{"item":"bao_nguyen_dan","chance":0.12,"min":1,"max":1},{"item":"thien_ngo_dan","chance":0.15,"min":1,"max":1}]},"3":{"normal":[{"item":"linh_nguyen_dan","chance":0.04,"min":1,"max":1},{"item":"bao_nguyen_dan","chance":0.01,"min":1,"max":1}],"rare1":[{"item":"linh_nguyen_dan","chance":0.2,"min":1,"max":2},{"item":"bao_nguyen_dan","chance":0.08,"min":1,"max":1},{"item":"thien_ngo_dan","chance":0.06,"min":1,"max":1}],"rare2":[{"item":"linh_nguyen_dan","chance":0.5,"min":1,"max":3},{"item":"bao_nguyen_dan","chance":0.25,"min":1,"max":2},{"item":"thien_ngo_dan","chance":0.25,"min":1,"max":1}]}}}',1792868065125,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('stats','{"maxHp":{"base":100,"perCanCot":15,"perLevel":25},"maxMp":{"base":50,"perLinhLuc":10,"perLevel":12},"attack":{"base":5,"perLinhLuc":2,"perCanCot":0.5,"perLevel":3},"defense":{"base":2,"perCanCot":1.5,"perLevel":2},"critRate":{"base":5,"perThanThuc":0.5},"dodgeRate":{"perThanPhap":0.5},"expBonus":{"perNgoTinh":1},"dropBonus":{"perPhucDuyen":0.5},"rateCap":60}',1792868065125,NULL);
INSERT INTO "game_tuning" ("name","value","updated_at","updated_by") VALUES('alchemy','{"maxJobs":3,"recipes":[{"id":"linh_nguyen_dan","nameVi":"Luyện Linh Nguyên Đan","output":"linh_nguyen_dan","qty":1,"inputs":[{"item":"linh_thao","qty":10},{"item":"yeu_dan","qty":2}],"linhThach":5000,"seconds":60,"enabled":true},{"id":"bao_nguyen_dan","nameVi":"Luyện Bảo Nguyên Đan","output":"bao_nguyen_dan","qty":1,"inputs":[{"item":"linh_thao","qty":20},{"item":"yeu_dan","qty":5}],"linhThach":20000,"seconds":300,"enabled":true},{"id":"thien_ngo_dan","nameVi":"Luyện Thiên Ngộ Đan","output":"thien_ngo_dan","qty":1,"inputs":[{"item":"linh_thao","qty":20},{"item":"yeu_dan","qty":10},{"item":"thu_cot","qty":10}],"linhThach":50000,"seconds":600,"enabled":true}]}',1792932300548,NULL);
CREATE TABLE shop_merchants (
  npc_id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL,
  name_vi TEXT NOT NULL,
  sell_rate REAL NOT NULL,
  buys TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT
);
CREATE TABLE shop_stock (
  npc_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  def TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (npc_id, rule_id)
);
CREATE TABLE npc_spots (
  npc_id TEXT NOT NULL,
  map_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  name_vi TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  -- Some NPCs (the three Đạo Sư) stand in more than one town under the same id.
  PRIMARY KEY (map_id, npc_id)
);
INSERT INTO "npc_spots" ("npc_id","map_id","kind","name_vi","x","y","sort","enabled","updated_at","updated_by") VALUES('merchant','town','merchant','Thương nhân',48.5,42.5,0,1,1792735890298,NULL);
INSERT INTO "npc_spots" ("npc_id","map_id","kind","name_vi","x","y","sort","enabled","updated_at","updated_by") VALUES('elder','town','quest','Trưởng Lão',41.5,42.5,1,1,1792735890298,NULL);
INSERT INTO "npc_spots" ("npc_id","map_id","kind","name_vi","x","y","sort","enabled","updated_at","updated_by") VALUES('smith','town','smith','Thợ Rèn',40.5,45.5,2,1,1792735890298,NULL);
INSERT INTO "npc_spots" ("npc_id","map_id","kind","name_vi","x","y","sort","enabled","updated_at","updated_by") VALUES('waygate','town','waygate','Truyền Tống Trận',45.5,45.5,3,1,1792735890298,NULL);
INSERT INTO "npc_spots" ("npc_id","map_id","kind","name_vi","x","y","sort","enabled","updated_at","updated_by") VALUES('path_kiem','town','quest','Kiếm Đạo Sư',47.5,49.5,4,1,1792735890298,NULL);
INSERT INTO "npc_spots" ("npc_id","map_id","kind","name_vi","x","y","sort","enabled","updated_at","updated_by") VALUES('path_thuat','town','quest','Thuật Đạo Sư',50.5,49.5,5,1,1792735890298,NULL);
INSERT INTO "npc_spots" ("npc_id","map_id","kind","name_vi","x","y","sort","enabled","updated_at","updated_by") VALUES('path_dan','town','quest','Đan Đạo Sư',53.5,49.5,6,1,1792735890298,NULL);
INSERT INTO "npc_spots" ("npc_id","map_id","kind","name_vi","x","y","sort","enabled","updated_at","updated_by") VALUES('merchant2','town2','merchant','Thương nhân',48.5,42.5,7,1,1792735890298,NULL);
INSERT INTO "npc_spots" ("npc_id","map_id","kind","name_vi","x","y","sort","enabled","updated_at","updated_by") VALUES('elder2','town2','quest','Trưởng Lão',41.5,42.5,8,1,1792735890298,NULL);
INSERT INTO "npc_spots" ("npc_id","map_id","kind","name_vi","x","y","sort","enabled","updated_at","updated_by") VALUES('smith2','town2','smith','Thợ Rèn',40.5,45.5,9,1,1792735890298,NULL);
INSERT INTO "npc_spots" ("npc_id","map_id","kind","name_vi","x","y","sort","enabled","updated_at","updated_by") VALUES('waygate2','town2','waygate','Truyền Tống Trận',45.5,45.5,10,1,1792735890298,NULL);
INSERT INTO "npc_spots" ("npc_id","map_id","kind","name_vi","x","y","sort","enabled","updated_at","updated_by") VALUES('path_kiem','town2','quest','Kiếm Đạo Sư',47.5,49.5,11,1,1792735890298,NULL);
INSERT INTO "npc_spots" ("npc_id","map_id","kind","name_vi","x","y","sort","enabled","updated_at","updated_by") VALUES('path_thuat','town2','quest','Thuật Đạo Sư',50.5,49.5,12,1,1792735890298,NULL);
INSERT INTO "npc_spots" ("npc_id","map_id","kind","name_vi","x","y","sort","enabled","updated_at","updated_by") VALUES('path_dan','town2','quest','Đan Đạo Sư',53.5,49.5,13,1,1792735890298,NULL);
INSERT INTO "npc_spots" ("npc_id","map_id","kind","name_vi","x","y","sort","enabled","updated_at","updated_by") VALUES('alchemist','town','alchemist','Đan Sư',52.5,42.5,0,1,1792932301107,NULL);
INSERT INTO "npc_spots" ("npc_id","map_id","kind","name_vi","x","y","sort","enabled","updated_at","updated_by") VALUES('alchemist2','town2','alchemist','Đan Sư',52.5,42.5,1,1,1792932301107,NULL);
CREATE TABLE boss_kills (
  map_id TEXT PRIMARY KEY,
  kills INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE tien_ngoc_ledger (
  id INTEGER PRIMARY KEY,
  character_id TEXT NOT NULL,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE linh_thach_ledger (
  id INTEGER PRIMARY KEY,
  character_id TEXT NOT NULL,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE currency_dedupe (
  key TEXT PRIMARY KEY,
  expires_at INTEGER
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "tien_ngoc_totals" (
  character_id TEXT NOT NULL,
  grp TEXT NOT NULL,
  total_in INTEGER NOT NULL DEFAULT 0 CHECK (total_in >= 0),
  total_out INTEGER NOT NULL DEFAULT 0 CHECK (total_out >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, grp)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "linh_thach_totals" (
  character_id TEXT NOT NULL,
  grp TEXT NOT NULL,
  total_in INTEGER NOT NULL DEFAULT 0 CHECK (total_in >= 0),
  total_out INTEGER NOT NULL DEFAULT 0 CHECK (total_out >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, grp)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "cong_hien_totals" (
  character_id TEXT NOT NULL,
  grp TEXT NOT NULL,
  total_in INTEGER NOT NULL DEFAULT 0 CHECK (total_in >= 0),
  total_out INTEGER NOT NULL DEFAULT 0 CHECK (total_out >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (character_id, grp)
) WITHOUT ROWID;
CREATE TABLE currency_audit (
  currency TEXT NOT NULL CHECK (currency IN ('linh_thach', 'cong_hien', 'tien_ngoc')),
  character_id TEXT NOT NULL,
  history_amount INTEGER NOT NULL,
  balance_amount INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('invalid', 'valid', 'handled')),
  checked_at INTEGER NOT NULL,
  resolved_by TEXT,
  resolved_at INTEGER,
  PRIMARY KEY (currency, character_id)
) WITHOUT ROWID;
CREATE TABLE admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  admin_email TEXT NOT NULL,
  screen TEXT NOT NULL,
  content TEXT NOT NULL
);
CREATE TABLE gift_batches (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  admin_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('list', 'all')),
  recipients INTEGER NOT NULL DEFAULT 0,
  attachments TEXT NOT NULL,
  expires_at INTEGER
);
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  custom INTEGER NOT NULL CHECK (custom IN (0, 1)),
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  def TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
CREATE TABLE brew_jobs (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  item TEXT NOT NULL,
  qty INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ready_at INTEGER NOT NULL,
  collected_at INTEGER
);
CREATE TABLE map_recipes (
  map_id TEXT PRIMARY KEY,
  def TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT
, name_vi TEXT);
INSERT INTO "map_recipes" ("map_id","def","updated_at","updated_by","name_vi") VALUES('town','{"id":"town","size":90,"rect":{"halfW":45,"halfH":22.5},"home":"town","palette":{"groundA":4020794,"groundB":3691834,"obstacle":5917242},"spawn":[45,45],"safe":true,"realm":null,"portals":[{"x":65,"y":65,"toMap":"forest","toX":41,"toY":41}],"ops":[{"op":"disc","cx":52.5,"cy":35.5,"r":3.6,"walkable":false},{"op":"chamfered","x0":33,"y0":47,"x1":40.5,"y1":52.5,"cut":1,"walkable":false},{"op":"chamfered","x0":47,"y0":53,"x1":53.5,"y1":57.5,"cut":0.8,"walkable":false},{"op":"disc","cx":43.5,"cy":43.5,"r":0.45,"walkable":false},{"op":"disc","cx":46.5,"cy":43.5,"r":0.45,"walkable":false},{"op":"disc","cx":43.5,"cy":46.5,"r":0.45,"walkable":false},{"op":"disc","cx":46.5,"cy":46.5,"r":0.45,"walkable":false},{"op":"rect","x0":35,"y0":35,"x1":41.5,"y1":35.3,"walkable":false},{"op":"rect","x0":58,"y0":45,"x1":58.3,"y1":53.5,"walkable":false},{"op":"disc","cx":48.5,"cy":42.5,"r":0.4,"walkable":false},{"op":"disc","cx":41.5,"cy":42.5,"r":0.4,"walkable":false},{"op":"disc","cx":52.5,"cy":42.5,"r":0.4,"walkable":false},{"op":"disc","cx":47.5,"cy":49.5,"r":0.4,"walkable":false},{"op":"disc","cx":50.5,"cy":49.5,"r":0.4,"walkable":false},{"op":"disc","cx":53.5,"cy":49.5,"r":0.4,"walkable":false},{"op":"srect","px0":-40,"py0":-17,"px1":-30,"py1":-9,"walkable":false},{"op":"srect","px0":28,"py0":-18,"px1":38,"py1":-10,"walkable":false},{"op":"srect","px0":-39,"py0":8,"px1":-29,"py1":15,"walkable":false},{"op":"srect","px0":30,"py0":9,"px1":40,"py1":16,"walkable":false},{"op":"blockAt","px":-12,"py":-14,"r":0.6},{"op":"blockAt","px":12,"py":-14,"r":0.6},{"op":"blockAt","px":-12,"py":14,"r":0.6},{"op":"blockAt","px":12,"py":14,"r":0.6},{"op":"frame","halfW":45,"halfH":22.5,"bandX":2,"bandY":1.5},{"op":"srect","px0":-3,"py0":15,"px1":3,"py1":22.5,"walkable":true},{"op":"clip","halfW":45,"halfH":22.5}],"content":{"groups":[],"guards":[[60,64],[64,60]],"bossSpot":null}}',1792932300664,NULL,NULL);
INSERT INTO "map_recipes" ("map_id","def","updated_at","updated_by","name_vi") VALUES('forest','{"id":"forest","size":150,"rect":{"halfW":75,"halfH":37.5},"home":"town","palette":{"groundA":4020794,"groundB":3691834,"obstacle":5917242},"spawn":[41,41],"safe":false,"realm":0,"portals":[{"x":39,"y":39,"toMap":"town","toX":63,"toY":63},{"x":111,"y":38,"toMap":"cave","toX":28,"toY":112}],"ops":[{"op":"scatter","seed":1337,"count":1300,"rMin":0.3,"rMax":0.55,"halfW":75,"halfH":37.5},{"op":"frame","halfW":75,"halfH":37.5,"bandX":2,"bandY":1.5},{"op":"srect","px0":-8,"py0":-37.5,"px1":8,"py1":-28,"walkable":true},{"op":"srect","px0":-2,"py0":-37.5,"px1":2,"py1":2,"walkable":true},{"op":"srect","px0":-72,"py0":-2,"px1":75,"py1":2,"walkable":true},{"op":"srect","px0":67,"py0":-6,"px1":75,"py1":6,"walkable":true},{"op":"srect","px0":-47,"py0":-32,"px1":-31,"py1":-22,"walkable":true},{"op":"srect","px0":-21,"py0":-32,"px1":-5,"py1":-22,"walkable":true},{"op":"srect","px0":5,"py0":-32,"px1":21,"py1":-22,"walkable":true},{"op":"srect","px0":31,"py0":-32,"px1":47,"py1":-22,"walkable":true},{"op":"srect","px0":-60,"py0":-18,"px1":-44,"py1":-8,"walkable":true},{"op":"srect","px0":-34,"py0":-18,"px1":-18,"py1":-8,"walkable":true},{"op":"srect","px0":18,"py0":-18,"px1":34,"py1":-8,"walkable":true},{"op":"srect","px0":44,"py0":-18,"px1":60,"py1":-8,"walkable":true},{"op":"srect","px0":-60,"py0":8,"px1":-44,"py1":18,"walkable":true},{"op":"srect","px0":-34,"py0":8,"px1":-18,"py1":18,"walkable":true},{"op":"srect","px0":-8,"py0":8,"px1":8,"py1":18,"walkable":true},{"op":"srect","px0":18,"py0":8,"px1":34,"py1":18,"walkable":true},{"op":"srect","px0":44,"py0":8,"px1":60,"py1":18,"walkable":true},{"op":"srect","px0":-47,"py0":22,"px1":-31,"py1":32,"walkable":true},{"op":"srect","px0":-21,"py0":22,"px1":-5,"py1":32,"walkable":true},{"op":"srect","px0":5,"py0":22,"px1":21,"py1":32,"walkable":true},{"op":"srect","px0":31,"py0":22,"px1":47,"py1":32,"walkable":true},{"op":"clip","halfW":75,"halfH":37.5}],"content":{"groups":[{"tier":3,"kind":"soi_rung","x":28.5,"y":67.5,"radius":2,"count":4},{"tier":1,"kind":"soi_rung","x":41.5,"y":54.5,"radius":2,"count":4},{"tier":1,"kind":"soi_rung","x":54.5,"y":41.5,"radius":2,"count":4},{"tier":3,"kind":"soi_rung","x":67.5,"y":28.5,"radius":2,"count":4},{"tier":5,"kind":"heo_rung","x":36,"y":88,"radius":2,"count":4},{"tier":2,"kind":"soi_rung","x":49,"y":75,"radius":2,"count":4},{"tier":2,"kind":"soi_rung","x":75,"y":49,"radius":2,"count":4},{"tier":6,"kind":"heo_rung","x":88,"y":36,"radius":2,"count":4},{"tier":7,"kind":"bao_dem","x":62,"y":114,"radius":2,"count":4},{"tier":4,"kind":"heo_rung","x":75,"y":101,"radius":2,"count":4},{"tier":4,"kind":"heo_rung","x":88,"y":88,"radius":2,"count":4},{"tier":5,"kind":"heo_rung","x":101,"y":75,"radius":2,"count":4},{"tier":8,"kind":"bao_dem","x":114,"y":62,"radius":2,"count":4},{"tier":8,"kind":"bao_dem","x":82.5,"y":121.5,"radius":2,"count":4},{"tier":6,"kind":"heo_rung","x":95.5,"y":108.5,"radius":2,"count":4},{"tier":7,"kind":"bao_dem","x":108.5,"y":95.5,"radius":2,"count":4},{"tier":9,"kind":"bao_dem","x":121.5,"y":82.5,"radius":2,"count":4}],"guards":[[40,44],[44,40],[104.5,37.5],[112.5,45.5]],"bossSpot":[75,75]}}',1792932300664,NULL,NULL);
INSERT INTO "map_recipes" ("map_id","def","updated_at","updated_by","name_vi") VALUES('cave','{"id":"cave","size":140,"rect":{"halfW":90,"halfH":25},"home":"town","palette":{"groundA":4867392,"groundB":4406841,"obstacle":3025448},"spawn":[28,112],"safe":false,"realm":1,"portals":[{"x":26,"y":114,"toMap":"forest","toX":109,"toY":40},{"x":114,"y":26,"toMap":"town2","toX":25,"toY":65}],"ops":[{"op":"scatter","seed":4242,"count":900,"rMin":0.4,"rMax":1,"halfW":90,"halfH":25},{"op":"frame","halfW":90,"halfH":25,"bandX":2,"bandY":1.5},{"op":"srect","px0":-87,"py0":-4,"px1":87,"py1":4,"walkable":true},{"op":"srect","px0":-90,"py0":-6,"px1":-78,"py1":6,"walkable":true},{"op":"srect","px0":78,"py0":-6,"px1":90,"py1":6,"walkable":true},{"op":"srect","px0":-79,"py0":-19,"px1":-61,"py1":-7,"walkable":true},{"op":"srect","px0":-72,"py0":-13,"px1":-68,"py1":0,"walkable":true},{"op":"srect","px0":-79,"py0":7,"px1":-61,"py1":19,"walkable":true},{"op":"srect","px0":-72,"py0":0,"px1":-68,"py1":13,"walkable":true},{"op":"srect","px0":-59,"py0":-19,"px1":-41,"py1":-7,"walkable":true},{"op":"srect","px0":-52,"py0":-13,"px1":-48,"py1":0,"walkable":true},{"op":"srect","px0":-59,"py0":7,"px1":-41,"py1":19,"walkable":true},{"op":"srect","px0":-52,"py0":0,"px1":-48,"py1":13,"walkable":true},{"op":"srect","px0":-39,"py0":-19,"px1":-21,"py1":-7,"walkable":true},{"op":"srect","px0":-32,"py0":-13,"px1":-28,"py1":0,"walkable":true},{"op":"srect","px0":-39,"py0":7,"px1":-21,"py1":19,"walkable":true},{"op":"srect","px0":-32,"py0":0,"px1":-28,"py1":13,"walkable":true},{"op":"srect","px0":-19,"py0":-19,"px1":-1,"py1":-7,"walkable":true},{"op":"srect","px0":-12,"py0":-13,"px1":-8,"py1":0,"walkable":true},{"op":"srect","px0":-19,"py0":7,"px1":-1,"py1":19,"walkable":true},{"op":"srect","px0":-12,"py0":0,"px1":-8,"py1":13,"walkable":true},{"op":"srect","px0":1,"py0":-19,"px1":19,"py1":-7,"walkable":true},{"op":"srect","px0":8,"py0":-13,"px1":12,"py1":0,"walkable":true},{"op":"srect","px0":1,"py0":7,"px1":19,"py1":19,"walkable":true},{"op":"srect","px0":8,"py0":0,"px1":12,"py1":13,"walkable":true},{"op":"srect","px0":21,"py0":-19,"px1":39,"py1":-7,"walkable":true},{"op":"srect","px0":28,"py0":-13,"px1":32,"py1":0,"walkable":true},{"op":"srect","px0":21,"py0":7,"px1":39,"py1":19,"walkable":true},{"op":"srect","px0":28,"py0":0,"px1":32,"py1":13,"walkable":true},{"op":"srect","px0":41,"py0":-19,"px1":59,"py1":-7,"walkable":true},{"op":"srect","px0":48,"py0":-13,"px1":52,"py1":0,"walkable":true},{"op":"srect","px0":41,"py0":7,"px1":59,"py1":19,"walkable":true},{"op":"srect","px0":48,"py0":0,"px1":52,"py1":13,"walkable":true},{"op":"srect","px0":61,"py0":-19,"px1":79,"py1":-7,"walkable":true},{"op":"srect","px0":68,"py0":-13,"px1":72,"py1":0,"walkable":true},{"op":"srect","px0":61,"py0":7,"px1":79,"py1":19,"walkable":true},{"op":"srect","px0":68,"py0":0,"px1":72,"py1":13,"walkable":true},{"op":"clip","halfW":90,"halfH":25}],"content":{"groups":[{"tier":1,"kind":"doi_u_minh","x":22,"y":92,"radius":2,"count":3},{"tier":1,"kind":"doi_u_minh","x":48,"y":118,"radius":2,"count":3},{"tier":2,"kind":"doi_u_minh","x":32,"y":82,"radius":2,"count":3},{"tier":2,"kind":"doi_u_minh","x":58,"y":108,"radius":2,"count":3},{"tier":3,"kind":"doi_u_minh","x":42,"y":72,"radius":2,"count":3},{"tier":3,"kind":"doi_u_minh","x":68,"y":98,"radius":2,"count":3},{"tier":4,"kind":"thi_quy","x":52,"y":62,"radius":2,"count":3},{"tier":4,"kind":"thi_quy","x":78,"y":88,"radius":2,"count":3},{"tier":5,"kind":"thi_quy","x":62,"y":52,"radius":2,"count":3},{"tier":6,"kind":"thi_quy","x":88,"y":78,"radius":2,"count":3},{"tier":6,"kind":"thi_quy","x":72,"y":42,"radius":2,"count":3},{"tier":7,"kind":"xich_thi","x":98,"y":68,"radius":2,"count":3},{"tier":7,"kind":"xich_thi","x":82,"y":32,"radius":2,"count":3},{"tier":8,"kind":"xich_thi","x":108,"y":58,"radius":2,"count":3},{"tier":8,"kind":"xich_thi","x":92,"y":22,"radius":2,"count":3},{"tier":9,"kind":"xich_thi","x":118,"y":48,"radius":2,"count":3}],"guards":[[25,107],[33,115],[107,25],[115,33]],"bossSpot":[70,70]}}',1792932300664,NULL,NULL);
INSERT INTO "map_recipes" ("map_id","def","updated_at","updated_by","name_vi") VALUES('town2','{"id":"town2","size":90,"rect":{"halfW":45,"halfH":22.5},"home":"town2","palette":{"groundA":4871520,"groundB":4476762,"obstacle":7035466},"spawn":[45,45],"safe":true,"realm":null,"guardRealm":2,"portals":[{"x":23,"y":66,"toMap":"cave","toX":112,"toY":28},{"x":58,"y":15,"toMap":"kimdan","toX":42,"toY":118},{"x":74,"y":31,"toMap":"nguyenanh","toX":44,"toY":125}],"ops":[{"op":"disc","cx":52.5,"cy":35.5,"r":3.6,"walkable":false},{"op":"chamfered","x0":33,"y0":47,"x1":40.5,"y1":52.5,"cut":1,"walkable":false},{"op":"chamfered","x0":47,"y0":53,"x1":53.5,"y1":57.5,"cut":0.8,"walkable":false},{"op":"disc","cx":43.5,"cy":43.5,"r":0.45,"walkable":false},{"op":"disc","cx":46.5,"cy":43.5,"r":0.45,"walkable":false},{"op":"disc","cx":43.5,"cy":46.5,"r":0.45,"walkable":false},{"op":"disc","cx":46.5,"cy":46.5,"r":0.45,"walkable":false},{"op":"rect","x0":35,"y0":35,"x1":41.5,"y1":35.3,"walkable":false},{"op":"rect","x0":58,"y0":45,"x1":58.3,"y1":53.5,"walkable":false},{"op":"disc","cx":48.5,"cy":42.5,"r":0.4,"walkable":false},{"op":"disc","cx":41.5,"cy":42.5,"r":0.4,"walkable":false},{"op":"disc","cx":52.5,"cy":42.5,"r":0.4,"walkable":false},{"op":"disc","cx":47.5,"cy":49.5,"r":0.4,"walkable":false},{"op":"disc","cx":50.5,"cy":49.5,"r":0.4,"walkable":false},{"op":"disc","cx":53.5,"cy":49.5,"r":0.4,"walkable":false},{"op":"srect","px0":-40,"py0":-17,"px1":-30,"py1":-9,"walkable":false},{"op":"srect","px0":28,"py0":-18,"px1":38,"py1":-10,"walkable":false},{"op":"srect","px0":-39,"py0":8,"px1":-29,"py1":15,"walkable":false},{"op":"srect","px0":30,"py0":9,"px1":40,"py1":16,"walkable":false},{"op":"blockAt","px":-12,"py":-14,"r":0.6},{"op":"blockAt","px":12,"py":-14,"r":0.6},{"op":"blockAt","px":-12,"py":14,"r":0.6},{"op":"blockAt","px":12,"py":14,"r":0.6},{"op":"frame","halfW":45,"halfH":22.5,"bandX":2,"bandY":1.5},{"op":"srect","px0":-45,"py0":-3,"px1":-14,"py1":3,"walkable":true},{"op":"srect","px0":14,"py0":-11,"px1":45,"py1":-5,"walkable":true},{"op":"srect","px0":14,"py0":5,"px1":45,"py1":11,"walkable":true},{"op":"clip","halfW":45,"halfH":22.5}],"content":{"groups":[],"guards":[[23,61],[29,67],[53,15],[59,21],[69,31],[75,37]],"bossSpot":null}}',1792932300664,NULL,NULL);
INSERT INTO "map_recipes" ("map_id","def","updated_at","updated_by","name_vi") VALUES('kimdan','{"id":"kimdan","size":160,"rect":{"halfW":80,"halfH":40},"home":"town2","palette":{"groundA":5978672,"groundB":5584169,"obstacle":2759190},"spawn":[43,117],"safe":false,"realm":2,"portals":[{"x":41,"y":119,"toMap":"town2","toX":57,"toY":17}],"ops":[{"op":"scatter","seed":7001,"count":1300,"rMin":0.35,"rMax":0.8,"halfW":80,"halfH":40},{"op":"frame","halfW":80,"halfH":40,"bandX":2,"bandY":1.5},{"op":"srect","px0":-80,"py0":-6,"px1":-66,"py1":6,"walkable":true},{"op":"srect","px0":-77,"py0":-2,"px1":77,"py1":2,"walkable":true},{"op":"srect","px0":-47,"py0":-32,"px1":-31,"py1":-22,"walkable":true},{"op":"srect","px0":-21,"py0":-32,"px1":-5,"py1":-22,"walkable":true},{"op":"srect","px0":5,"py0":-32,"px1":21,"py1":-22,"walkable":true},{"op":"srect","px0":31,"py0":-32,"px1":47,"py1":-22,"walkable":true},{"op":"srect","px0":-60,"py0":-18,"px1":-44,"py1":-8,"walkable":true},{"op":"srect","px0":-34,"py0":-18,"px1":-18,"py1":-8,"walkable":true},{"op":"srect","px0":-8,"py0":-18,"px1":8,"py1":-8,"walkable":true},{"op":"srect","px0":18,"py0":-18,"px1":34,"py1":-8,"walkable":true},{"op":"srect","px0":44,"py0":-18,"px1":60,"py1":-8,"walkable":true},{"op":"srect","px0":-60,"py0":8,"px1":-44,"py1":18,"walkable":true},{"op":"srect","px0":-34,"py0":8,"px1":-18,"py1":18,"walkable":true},{"op":"srect","px0":-8,"py0":8,"px1":8,"py1":18,"walkable":true},{"op":"srect","px0":18,"py0":8,"px1":34,"py1":18,"walkable":true},{"op":"srect","px0":44,"py0":8,"px1":60,"py1":18,"walkable":true},{"op":"srect","px0":-47,"py0":22,"px1":-31,"py1":32,"walkable":true},{"op":"srect","px0":-21,"py0":22,"px1":-5,"py1":32,"walkable":true},{"op":"srect","px0":5,"py0":22,"px1":21,"py1":32,"walkable":true},{"op":"srect","px0":31,"py0":22,"px1":47,"py1":32,"walkable":true},{"op":"clip","halfW":80,"halfH":40}],"content":{"groups":[{"tier":2,"kind":"hoa_dien_lang","x":33.5,"y":72.5,"radius":2,"count":4},{"tier":4,"kind":"nham_giap_thu","x":46.5,"y":59.5,"radius":2,"count":4},{"tier":6,"kind":"nham_giap_thu","x":59.5,"y":46.5,"radius":2,"count":4},{"tier":8,"kind":"liet_hoa_xa","x":72.5,"y":33.5,"radius":2,"count":4},{"tier":1,"kind":"hoa_dien_lang","x":41,"y":93,"radius":2,"count":4},{"tier":3,"kind":"hoa_dien_lang","x":54,"y":80,"radius":2,"count":4},{"tier":5,"kind":"nham_giap_thu","x":67,"y":67,"radius":2,"count":4},{"tier":7,"kind":"liet_hoa_xa","x":80,"y":54,"radius":2,"count":4},{"tier":9,"kind":"liet_hoa_xa","x":93,"y":41,"radius":2,"count":4},{"tier":1,"kind":"hoa_dien_lang","x":67,"y":119,"radius":2,"count":4},{"tier":3,"kind":"hoa_dien_lang","x":80,"y":106,"radius":2,"count":4},{"tier":5,"kind":"nham_giap_thu","x":93,"y":93,"radius":2,"count":4},{"tier":7,"kind":"liet_hoa_xa","x":106,"y":80,"radius":2,"count":4},{"tier":9,"kind":"liet_hoa_xa","x":119,"y":67,"radius":2,"count":4},{"tier":2,"kind":"hoa_dien_lang","x":87.5,"y":126.5,"radius":2,"count":4},{"tier":4,"kind":"nham_giap_thu","x":100.5,"y":113.5,"radius":2,"count":4},{"tier":6,"kind":"nham_giap_thu","x":113.5,"y":100.5,"radius":2,"count":4},{"tier":8,"kind":"liet_hoa_xa","x":126.5,"y":87.5,"radius":2,"count":4}],"guards":[[40,112],[48,120]],"bossSpot":[80,80]}}',1792932300664,NULL,NULL);
INSERT INTO "map_recipes" ("map_id","def","updated_at","updated_by","name_vi") VALUES('nguyenanh','{"id":"nguyenanh","size":170,"rect":{"halfW":85,"halfH":42.5},"home":"town2","palette":{"groundA":3821411,"groundB":3492188,"obstacle":1911608},"spawn":[45,124],"safe":false,"realm":3,"portals":[{"x":43,"y":126,"toMap":"town2","toX":73,"toY":33}],"ops":[{"op":"scatter","seed":9001,"count":1400,"rMin":0.35,"rMax":0.8,"halfW":85,"halfH":42.5},{"op":"frame","halfW":85,"halfH":42.5,"bandX":2,"bandY":1.5},{"op":"srect","px0":-85,"py0":-6,"px1":-71,"py1":6,"walkable":true},{"op":"srect","px0":-82,"py0":-2,"px1":82,"py1":2,"walkable":true},{"op":"srect","px0":-49,"py0":-34,"px1":-33,"py1":-24,"walkable":true},{"op":"srect","px0":-22,"py0":-34,"px1":-6,"py1":-24,"walkable":true},{"op":"srect","px0":5,"py0":-34,"px1":21,"py1":-24,"walkable":true},{"op":"srect","px0":32,"py0":-34,"px1":48,"py1":-24,"walkable":true},{"op":"srect","px0":-62,"py0":-19,"px1":-46,"py1":-9,"walkable":true},{"op":"srect","px0":-35,"py0":-19,"px1":-19,"py1":-9,"walkable":true},{"op":"srect","px0":-8,"py0":-19,"px1":8,"py1":-9,"walkable":true},{"op":"srect","px0":19,"py0":-19,"px1":35,"py1":-9,"walkable":true},{"op":"srect","px0":46,"py0":-19,"px1":62,"py1":-9,"walkable":true},{"op":"srect","px0":-62,"py0":9,"px1":-46,"py1":19,"walkable":true},{"op":"srect","px0":-35,"py0":9,"px1":-19,"py1":19,"walkable":true},{"op":"srect","px0":-8,"py0":9,"px1":8,"py1":19,"walkable":true},{"op":"srect","px0":19,"py0":9,"px1":35,"py1":19,"walkable":true},{"op":"srect","px0":46,"py0":9,"px1":62,"py1":19,"walkable":true},{"op":"srect","px0":-48,"py0":24,"px1":-32,"py1":34,"walkable":true},{"op":"srect","px0":-21,"py0":24,"px1":-5,"py1":34,"walkable":true},{"op":"srect","px0":6,"py0":24,"px1":22,"py1":34,"walkable":true},{"op":"srect","px0":33,"py0":24,"px1":49,"py1":34,"walkable":true},{"op":"clip","halfW":85,"halfH":42.5}],"content":{"groups":[{"tier":2,"kind":"bang_phong_hac","x":35.5,"y":76.5,"radius":2,"count":4},{"tier":4,"kind":"han_thi_ma","x":49,"y":63,"radius":2,"count":4},{"tier":6,"kind":"han_thi_ma","x":62.5,"y":49.5,"radius":2,"count":4},{"tier":8,"kind":"tuyet_yeu_hau","x":76,"y":36,"radius":2,"count":4},{"tier":1,"kind":"bang_phong_hac","x":44,"y":98,"radius":2,"count":4},{"tier":3,"kind":"bang_phong_hac","x":57.5,"y":84.5,"radius":2,"count":4},{"tier":5,"kind":"han_thi_ma","x":71,"y":71,"radius":2,"count":4},{"tier":7,"kind":"tuyet_yeu_hau","x":84.5,"y":57.5,"radius":2,"count":4},{"tier":9,"kind":"tuyet_yeu_hau","x":98,"y":44,"radius":2,"count":4},{"tier":1,"kind":"bang_phong_hac","x":72,"y":126,"radius":2,"count":4},{"tier":3,"kind":"bang_phong_hac","x":85.5,"y":112.5,"radius":2,"count":4},{"tier":5,"kind":"han_thi_ma","x":99,"y":99,"radius":2,"count":4},{"tier":7,"kind":"tuyet_yeu_hau","x":112.5,"y":85.5,"radius":2,"count":4},{"tier":9,"kind":"tuyet_yeu_hau","x":126,"y":72,"radius":2,"count":4},{"tier":2,"kind":"bang_phong_hac","x":94,"y":134,"radius":2,"count":4},{"tier":4,"kind":"han_thi_ma","x":107.5,"y":120.5,"radius":2,"count":4},{"tier":6,"kind":"han_thi_ma","x":121,"y":107,"radius":2,"count":4},{"tier":8,"kind":"tuyet_yeu_hau","x":134.5,"y":93.5,"radius":2,"count":4}],"guards":[[42.5,119.5],[50.5,127.5]],"bossSpot":[85,85]}}',1792932300664,NULL,NULL);
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('d1_migrations',46);
INSERT INTO "sqlite_sequence" ("name","seq") VALUES('admin_log',0);
CREATE INDEX idx_sessions_account ON sessions(account_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
CREATE INDEX idx_items_owner ON item_instances(owner_character_id);
CREATE INDEX idx_mailbox_character ON mailbox(character_id, created_at);
CREATE UNIQUE INDEX idx_items_cell ON item_instances(owner_character_id, bag_tab, cell);
CREATE INDEX idx_mailbox_expiry ON mailbox(expires_at) WHERE expires_at IS NOT NULL;
CREATE UNIQUE INDEX idx_constitutions_default ON constitutions(is_default) WHERE is_default = 1;
CREATE UNIQUE INDEX idx_items_equip ON item_instances(owner_character_id, equip_slot) WHERE equip_slot IS NOT NULL;
CREATE INDEX idx_characters_rank ON characters (realm DESC, stage DESC, exp DESC);
CREATE INDEX idx_tien_ngoc_ledger_at ON tien_ngoc_ledger (created_at);
CREATE INDEX idx_tien_ngoc_ledger_char ON tien_ngoc_ledger (character_id, created_at);
CREATE INDEX idx_linh_thach_ledger_at ON linh_thach_ledger (created_at);
CREATE INDEX idx_linh_thach_ledger_char ON linh_thach_ledger (character_id, created_at);
CREATE INDEX idx_admin_log_at ON admin_log (at);
CREATE INDEX idx_gift_batches_created ON gift_batches(created_at);
CREATE INDEX idx_brew_jobs_char ON brew_jobs (character_id, collected_at);
CREATE TRIGGER tien_ngoc_ledger_no_update BEFORE UPDATE ON tien_ngoc_ledger BEGIN SELECT RAISE(ABORT, 'tien_ngoc_ledger is append-only'); END;
CREATE TRIGGER tien_ngoc_ledger_no_delete BEFORE DELETE ON tien_ngoc_ledger BEGIN SELECT RAISE(ABORT, 'tien_ngoc_ledger is append-only'); END;
CREATE TRIGGER linh_thach_ledger_no_update BEFORE UPDATE ON linh_thach_ledger BEGIN SELECT RAISE(ABORT, 'linh_thach_ledger is append-only'); END;
CREATE TRIGGER linh_thach_ledger_no_delete BEFORE DELETE ON linh_thach_ledger BEGIN SELECT RAISE(ABORT, 'linh_thach_ledger is append-only'); END;
