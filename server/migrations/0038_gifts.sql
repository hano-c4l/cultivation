-- Phase 3d: gifts from an admin. A gift is a mail with attachments kept as JSON in `mailbox.gift` ({linh_thach, cong_hien, tien_ngoc, items: [{type, qty}], by}):
-- the currency and the item rows are created when the player claims it, so sending to the whole server writes one mailbox row per character and nothing else.
-- Mail ids of a gift are '<batch id>:<character id>', so a batch can be counted by a range on the primary key.
ALTER TABLE mailbox ADD COLUMN gift TEXT;

-- One row per send (the history of the screen "Gửi quà"); its id is made by the admin's form, so a double submit cannot send twice.
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
CREATE INDEX idx_gift_batches_created ON gift_batches(created_at);
