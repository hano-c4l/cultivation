-- Phase 5c-4: the daily tasks of the sect (hand-ins), the cap on the Linh Thạch the system adds to a sect's fund a day, and the item costs of the levels.
-- A member's tasks of a Việt Nam day (keyed by the character, so leaving and joining again does not reset the count).
CREATE TABLE sect_task_log (
  character_id TEXT NOT NULL REFERENCES characters(id),
  task_id TEXT NOT NULL,
  day INTEGER NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (character_id, task_id, day)
);
-- What the tasks added to the fund on `income_day` (a Việt Nam day).
ALTER TABLE sects ADD COLUMN income_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sects ADD COLUMN income_today INTEGER NOT NULL DEFAULT 0;

-- Phase 5c-4: the sect tuning group grew again (tasks, the daily income cap, item costs of the levels). Rows an Admin has edited are NOT dropped: every key the group needs and the row lacks is
-- written into it with its default (this also fills in the keys 5c-2 and 5c-3 added), so the edits stay and the row stays valid.
UPDATE game_tuning SET value = json_set(value, '$.upgradeRank', json('4')) WHERE name = 'sect' AND json_extract(value, '$.upgradeRank') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.donate', json('{"min":100,"linhPerPoint":100,"linhPerExp":200}')) WHERE name = 'sect' AND json_extract(value, '$.donate') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.weeklyMax', json('[2000,5000,10000,20000,50000,100000]')) WHERE name = 'sect' AND json_extract(value, '$.weeklyMax') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.shop', json('[{"item":"hoi_huyet_dan","cost":10,"qty":1,"minLevel":1,"minRank":0},{"item":"linh_thao","cost":15,"qty":5,"minLevel":1,"minRank":0},{"item":"duong_huyet_dan","cost":30,"qty":1,"minLevel":2,"minRank":0}]')) WHERE name = 'sect' AND json_extract(value, '$.shop') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.balance', json('{"upgradeCostPct":100,"incomePct":100}')) WHERE name = 'sect' AND json_extract(value, '$.balance') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.autoRanks', json('{"inner":500,"elite":5000}')) WHERE name = 'sect' AND json_extract(value, '$.autoRanks') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.vault', json('{"slots":[60,100,160,240,360],"pointsByGrade":[1,2,4,8,15,30,60,120,250],"rarityPct":[100,150,250,400],"catMax":150,"expPerPoint":1,"dailyCap":3000}')) WHERE name = 'sect' AND json_extract(value, '$.vault') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.disband', json('{"poolPct":60,"leaderPct":30,"deputyPct":10}')) WHERE name = 'sect' AND json_extract(value, '$.disband') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.tasks', json('[{"id":"mine","kind":"mine","name":"Đào linh thạch: nộp Tinh Thiết Luyện Khí","item":"ren_lk","qty":10,"perDay":2,"minLevel":1,"reward":{"contribution":20,"exp":10,"fundLinh":3000,"memberLinh":500}},{"id":"hunt_bone","kind":"hunt","name":"Phá hang ổ tà tu: nộp Thú Cốt","item":"thu_cot","qty":20,"perDay":2,"minLevel":1,"reward":{"contribution":25,"exp":12,"fundLinh":2000,"memberLinh":300,"vault":{"item":"thu_cot","qty":5}}},{"id":"hunt_dan","kind":"hunt","name":"Diệt yêu thú mạnh: nộp Yêu Đan","item":"yeu_dan","qty":3,"perDay":1,"minLevel":2,"reward":{"contribution":40,"exp":25,"fundLinh":5000,"memberLinh":800}},{"id":"alchemy","kind":"alchemy","name":"Luyện đan cho tông môn: nộp Hồi Huyết Đan","item":"hoi_huyet_dan","qty":10,"perDay":1,"minLevel":1,"reward":{"contribution":30,"exp":15,"fundLinh":1000,"memberLinh":0,"vault":{"item":"hoi_huyet_dan","qty":5}}},{"id":"gather","kind":"gather","name":"Hái dược liệu: nộp Linh Thảo","item":"linh_thao","qty":20,"perDay":2,"minLevel":1,"reward":{"contribution":15,"exp":8,"fundLinh":500,"memberLinh":0,"vault":{"item":"linh_thao","qty":10}}}]')) WHERE name = 'sect' AND json_extract(value, '$.tasks') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.taskIncomeCap', json('[20000,60000,150000,400000,1000000]')) WHERE name = 'sect' AND json_extract(value, '$.taskIncomeCap') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.levels[0].expNeed', json('500')) WHERE name = 'sect' AND json_extract(value, '$.levels[0]') IS NOT NULL AND json_extract(value, '$.levels[0].expNeed') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.levels[0].costLinh', json('200000')) WHERE name = 'sect' AND json_extract(value, '$.levels[0]') IS NOT NULL AND json_extract(value, '$.levels[0].costLinh') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.levels[0].costItems', json('[{"item":"linh_thao","qty":50}]')) WHERE name = 'sect' AND json_extract(value, '$.levels[0]') IS NOT NULL AND json_extract(value, '$.levels[0].costItems') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.levels[1].expNeed', json('2000')) WHERE name = 'sect' AND json_extract(value, '$.levels[1]') IS NOT NULL AND json_extract(value, '$.levels[1].expNeed') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.levels[1].costLinh', json('800000')) WHERE name = 'sect' AND json_extract(value, '$.levels[1]') IS NOT NULL AND json_extract(value, '$.levels[1].costLinh') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.levels[1].costItems', json('[{"item":"thu_cot","qty":100}]')) WHERE name = 'sect' AND json_extract(value, '$.levels[1]') IS NOT NULL AND json_extract(value, '$.levels[1].costItems') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.levels[2].expNeed', json('6000')) WHERE name = 'sect' AND json_extract(value, '$.levels[2]') IS NOT NULL AND json_extract(value, '$.levels[2].expNeed') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.levels[2].costLinh', json('2500000')) WHERE name = 'sect' AND json_extract(value, '$.levels[2]') IS NOT NULL AND json_extract(value, '$.levels[2].costLinh') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.levels[2].costItems', json('[{"item":"yeu_dan","qty":30}]')) WHERE name = 'sect' AND json_extract(value, '$.levels[2]') IS NOT NULL AND json_extract(value, '$.levels[2].costItems') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.levels[3].expNeed', json('15000')) WHERE name = 'sect' AND json_extract(value, '$.levels[3]') IS NOT NULL AND json_extract(value, '$.levels[3].expNeed') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.levels[3].costLinh', json('8000000')) WHERE name = 'sect' AND json_extract(value, '$.levels[3]') IS NOT NULL AND json_extract(value, '$.levels[3].costLinh') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.levels[3].costItems', json('[{"item":"yeu_dan","qty":100}]')) WHERE name = 'sect' AND json_extract(value, '$.levels[3]') IS NOT NULL AND json_extract(value, '$.levels[3].costItems') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.levels[4].expNeed', json('0')) WHERE name = 'sect' AND json_extract(value, '$.levels[4]') IS NOT NULL AND json_extract(value, '$.levels[4].expNeed') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.levels[4].costLinh', json('0')) WHERE name = 'sect' AND json_extract(value, '$.levels[4]') IS NOT NULL AND json_extract(value, '$.levels[4].costLinh') IS NULL;
UPDATE game_tuning SET value = json_set(value, '$.levels[4].costItems', json('[]')) WHERE name = 'sect' AND json_extract(value, '$.levels[4]') IS NOT NULL AND json_extract(value, '$.levels[4].costItems') IS NULL;
UPDATE config_versions SET version = version + 1 WHERE name = 'tuning';
