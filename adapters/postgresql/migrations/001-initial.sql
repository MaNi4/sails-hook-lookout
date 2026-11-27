-- Lookout's tables. IF NOT EXISTS so that databases set up with schema.sql of
-- Lookout 0.1–0.3 are adopted as they are, data included.
-- Rules for every migration: see ../migrations.js.

CREATE TABLE IF NOT EXISTS lookout_migrations (
  name       text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO lookout_migrations (name) VALUES ('001-initial');

-- One random salt per UTC day. Lookout deletes past salts, so a stored
-- visit token can no longer be linked back to an IP address and user agent.
CREATE TABLE IF NOT EXISTS lookout_salts (
  day  date PRIMARY KEY,
  salt text NOT NULL
);

-- A visit is one visitor (salted hash of IP + user agent) during one UTC day.
-- Created by the first event, so clients that never run JavaScript leave no row.
CREATE TABLE IF NOT EXISTS lookout_visits (
  id               bigserial PRIMARY KEY,
  visit_token      text NOT NULL UNIQUE,
  landing_page     text,
  referring_domain text,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  started_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lookout_visits_started_at_idx ON lookout_visits (started_at);

CREATE TABLE IF NOT EXISTS lookout_events (
  id         bigserial PRIMARY KEY,
  visit_id   bigint NOT NULL REFERENCES lookout_visits (id) ON DELETE CASCADE,
  name       text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}',
  time       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lookout_events_name_time_idx ON lookout_events (name, time);
CREATE INDEX IF NOT EXISTS lookout_events_visit_id_idx ON lookout_events (visit_id);
