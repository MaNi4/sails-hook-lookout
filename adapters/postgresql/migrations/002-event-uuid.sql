-- 0.4.0: the event's random id, so an event sent again is recorded once.
-- Null for events recorded before.

INSERT INTO lookout_migrations (name) VALUES ('002-event-uuid');

ALTER TABLE lookout_events ADD COLUMN IF NOT EXISTS uuid uuid UNIQUE;
