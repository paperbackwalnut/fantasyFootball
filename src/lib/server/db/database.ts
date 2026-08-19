import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const dataDirectory = resolve('.data');
export const databasePath = resolve(process.env.LOCAL_DB_PATH || resolve(dataDirectory, 'fantasy-football.sqlite'));
let instance: Database.Database | null = null;

const migrationSql = `
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY, platform TEXT NOT NULL CHECK(platform IN ('ESPN','SLEEPER')),
  external_id TEXT NOT NULL, season_year INTEGER NOT NULL, name TEXT NOT NULL,
  team_count INTEGER NOT NULL DEFAULT 0, draft_type TEXT NOT NULL DEFAULT 'SNAKE',
  draft_started INTEGER NOT NULL DEFAULT 0, draft_completed INTEGER NOT NULL DEFAULT 0,
  user_team_id TEXT, auth_json TEXT, settings_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(platform, external_id, season_year)
);
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY, league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  platform_team_id TEXT NOT NULL, name TEXT NOT NULL, owner_name TEXT,
  draft_position INTEGER, is_user INTEGER NOT NULL DEFAULT 0, data_json TEXT,
  UNIQUE(league_id, platform_team_id)
);
CREATE TABLE IF NOT EXISTS draft_picks (
  league_id TEXT NOT NULL REFERENCES leagues(id) ON DELETE CASCADE, pick_number INTEGER NOT NULL,
  round_number INTEGER NOT NULL, round_pick INTEGER NOT NULL, team_id TEXT,
  platform_player_id TEXT, player_name TEXT NOT NULL, player_position TEXT, player_nfl_team TEXT,
  player_data_json TEXT, picked_at TEXT, PRIMARY KEY(league_id, pick_number)
);
CREATE TABLE IF NOT EXISTS sync_observations (
  id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, captured_at TEXT NOT NULL,
  type TEXT NOT NULL, data_json TEXT NOT NULL, received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sync_observations_type_time ON sync_observations(type, captured_at);
CREATE TABLE IF NOT EXISTS live_draft_state (
  platform TEXT PRIMARY KEY, updated_at TEXT NOT NULL, state_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS draft_sessions (
  id TEXT PRIMARY KEY, platform TEXT NOT NULL, external_id TEXT, season_year INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('MOCK','LEAGUE','UNKNOWN')), name TEXT NOT NULL,
  user_team_id TEXT, team_count INTEGER NOT NULL DEFAULT 0, draft_slot INTEGER,
  completed_at TEXT NOT NULL, state_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS draft_sessions_completed ON draft_sessions(completed_at DESC);
CREATE INDEX IF NOT EXISTS draft_sessions_kind ON draft_sessions(kind, completed_at DESC);
CREATE TABLE IF NOT EXISTS recommendation_snapshots (
  id TEXT PRIMARY KEY, platform TEXT NOT NULL, external_id TEXT, season_year INTEGER NOT NULL,
  user_team_id TEXT, current_pick INTEGER NOT NULL, state_updated_at TEXT NOT NULL,
  context_json TEXT NOT NULL, recommendations_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS recommendation_snapshots_draft_pick ON recommendation_snapshots(platform,external_id,season_year,user_team_id,current_pick,created_at DESC);
CREATE TABLE IF NOT EXISTS provider_cache (
  key TEXT PRIMARY KEY, value_json TEXT NOT NULL, expires_at TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY, full_name TEXT NOT NULL, normalized_name TEXT NOT NULL,
  position TEXT, nfl_team TEXT, bye_week INTEGER, active INTEGER NOT NULL DEFAULT 1,
  espn_id TEXT, sleeper_id TEXT, fantasypros_id TEXT, data_json TEXT, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS players_espn_id ON players(espn_id) WHERE espn_id IS NOT NULL AND espn_id <> '';
CREATE INDEX IF NOT EXISTS players_normalized_name ON players(normalized_name);
CREATE TABLE IF NOT EXISTS player_values (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE, season_year INTEGER NOT NULL,
  scoring_format TEXT NOT NULL, source TEXT NOT NULL, overall_rank REAL, position_rank REAL,
  adp REAL, projected_points REAL, tier INTEGER, value_json TEXT, fetched_at TEXT NOT NULL,
  PRIMARY KEY(player_id, season_year, scoring_format, source)
);
CREATE TABLE IF NOT EXISTS player_news (
  id TEXT PRIMARY KEY, player_id TEXT REFERENCES players(id) ON DELETE CASCADE, source TEXT NOT NULL,
  published_at TEXT NOT NULL, headline TEXT NOT NULL, summary TEXT, injury_status TEXT,
  practice_status TEXT, impact_score REAL, url TEXT, data_json TEXT
);
CREATE INDEX IF NOT EXISTS player_news_player_time ON player_news(player_id, published_at DESC);
CREATE TABLE IF NOT EXISTS depth_chart_links (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  related_player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  relation TEXT NOT NULL, source TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL, PRIMARY KEY(player_id, related_player_id, relation, source)
);
CREATE TABLE IF NOT EXISTS player_status (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  source TEXT NOT NULL, status TEXT, injury_status TEXT, injury_body_part TEXT,
  practice_participation TEXT, depth_chart_position INTEGER, news_updated_at TEXT,
  data_json TEXT, fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS player_trends (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  source TEXT NOT NULL, trend_type TEXT NOT NULL, lookback_hours INTEGER NOT NULL,
  activity_count INTEGER NOT NULL, fetched_at TEXT NOT NULL,
  PRIMARY KEY(player_id, source, trend_type, lookback_hours)
);
CREATE TABLE IF NOT EXISTS provider_player_ids (
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, provider_id TEXT NOT NULL,
  updated_at TEXT NOT NULL, PRIMARY KEY(provider, provider_id), UNIQUE(player_id, provider)
);
`;

export function getDatabase() {
	if (instance) return instance;
	mkdirSync(dataDirectory, { recursive: true });
	instance = new Database(databasePath);
	instance.pragma('journal_mode = WAL');
	instance.pragma('foreign_keys = ON');
	instance.pragma('busy_timeout = 5000');
	instance.exec(migrationSql);
	instance.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?)').run(new Date().toISOString());
	instance.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(2, ?)').run(new Date().toISOString());
	instance.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(3, ?)').run(new Date().toISOString());
	instance.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(4, ?)').run(new Date().toISOString());
	instance.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(5, ?)').run(new Date().toISOString());
	instance.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(6, ?)').run(new Date().toISOString());
	return instance;
}

export function closeDatabase() {
	instance?.close();
	instance = null;
}
