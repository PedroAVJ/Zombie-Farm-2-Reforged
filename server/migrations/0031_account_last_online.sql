-- Denormalize the newest session activity onto accounts so administrative account
-- inspection can show one "last online" value per player without joining sessions.
ALTER TABLE accounts ADD COLUMN last_online_at INTEGER NOT NULL DEFAULT 0;

-- Preserve the best activity information already available. Accounts with no
-- sessions fall back to their creation time.
UPDATE accounts
SET last_online_at = MAX(
  created_at,
  COALESCE((
    SELECT MAX(s.last_used_at)
    FROM sessions s
    WHERE s.account_id = accounts.id
  ), 0)
);
