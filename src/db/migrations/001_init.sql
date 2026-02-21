CREATE TABLE IF NOT EXISTS monitored_apps (
  id              SERIAL PRIMARY KEY,
  app_address     TEXT NOT NULL UNIQUE,
  last_seen_block BIGINT NOT NULL DEFAULT 0,
  poll_interval_s INT NOT NULL DEFAULT 300,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS builds (
  id                    SERIAL PRIMARY KEY,
  app_address           TEXT NOT NULL REFERENCES monitored_apps(app_address),
  block_number          BIGINT NOT NULL,
  image_digest          TEXT NOT NULL,
  registry              TEXT,
  repo_url              TEXT,
  git_ref               TEXT,
  provenance_verified   BOOLEAN DEFAULT FALSE,
  status                TEXT NOT NULL DEFAULT 'pending',
  retries               INT NOT NULL DEFAULT 0,
  last_attempt_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(app_address, image_digest)
);

CREATE TABLE IF NOT EXISTS reports (
  id               SERIAL PRIMARY KEY,
  build_id         INT NOT NULL REFERENCES builds(id),
  app_address      TEXT NOT NULL,
  report_json      JSONB NOT NULL,
  logs_json        JSONB NOT NULL,
  attestation_json JSONB NOT NULL,
  signature        TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_builds_app ON builds(app_address);
CREATE INDEX IF NOT EXISTS idx_builds_status ON builds(status);
CREATE INDEX IF NOT EXISTS idx_reports_app ON reports(app_address);
CREATE INDEX IF NOT EXISTS idx_reports_build ON reports(build_id);
