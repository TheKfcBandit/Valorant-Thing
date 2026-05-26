// SQLite-backed match history. Replaces the file-backed JSON HashMap in
// match_cache.rs once the user's match count outgrew it (loading the whole
// blob and sorting in-process every read doesn't scale past a few hundred
// matches). Command signatures + return shapes are kept byte-compatible
// with the old match_cache::* commands so other consumers (CoachPage,
// PartyPage, WrappedPage) don't need changes.
//
// Connection lifecycle: lazy-opened on first access via `with_conn`, then
// kept open for the process lifetime behind a Mutex. Single-user local app
// — no pool needed. `bundled` rusqlite feature ships libsqlite3 with the
// binary so the installer doesn't depend on a system library.

use std::sync::Mutex;

use rusqlite::{params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::util::cache_path;

pub struct MatchDb {
    conn: Mutex<Option<Connection>>,
}

pub fn new_db() -> MatchDb {
    MatchDb {
        conn: Mutex::new(None),
    }
}

impl MatchDb {
    /// Run a closure with an open connection. First call opens the file +
    /// runs schema setup; subsequent calls reuse the cached connection.
    fn with_conn<R, F>(&self, app: &AppHandle, f: F) -> Result<R, String>
    where
        F: FnOnce(&mut Connection) -> Result<R, rusqlite::Error>,
    {
        // Recover from poisoning rather than locking the user out forever:
        // a panic inside one closure shouldn't break every subsequent invoke.
        let mut guard = self.conn.lock().unwrap_or_else(|p| p.into_inner());
        if guard.is_none() {
            let path = cache_path(app, "matches.db")?;
            let mut c = Connection::open(&path).map_err(|e| format!("open db: {}", e))?;
            init_schema(&mut c).map_err(|e| format!("init schema: {}", e))?;
            *guard = Some(c);
        }
        let conn = guard.as_mut().expect("just initialized");
        f(conn).map_err(|e| format!("db error: {}", e))
    }

    /// Read schema_meta key. None if the key doesn't exist yet.
    pub fn meta_get(&self, app: &AppHandle, key: &str) -> Result<Option<String>, String> {
        self.with_conn(app, |conn| {
            conn.query_row(
                "SELECT value FROM schema_meta WHERE key = ?1",
                params![key],
                |row| row.get::<_, String>(0),
            )
            .optional()
        })
    }

    pub fn meta_set(&self, app: &AppHandle, key: &str, value: &str) -> Result<(), String> {
        self.with_conn(app, |conn| {
            conn.execute(
                "INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?1, ?2)",
                params![key, value],
            )?;
            Ok(())
        })
    }

    /// Bulk insert used by the JSON migrator in lib.rs setup. Uses
    /// INSERT OR IGNORE so existing rows (from concurrent live fetches)
    /// win over stale migrated copies.
    pub fn import_entries(&self, app: &AppHandle, entries: &[Value]) -> Result<u32, String> {
        self.with_conn(app, |conn| {
            let tx = conn.transaction()?;
            let mut inserted = 0u32;
            {
                let mut stmt = tx.prepare(INSERT_OR_IGNORE_SQL)?;
                for entry in entries {
                    let row = match extract_row(entry) {
                        Some(r) => r,
                        None => continue,
                    };
                    let changed = stmt.execute(params![
                        row.match_id,
                        row.date_ms,
                        row.queue_id,
                        row.map_id,
                        row.agent_id,
                        row.kills,
                        row.deaths,
                        row.assists,
                        row.rounds_won,
                        row.rounds_lost,
                        row.won as i64,
                        row.teammates_json,
                        row.enemies_json,
                        row.raw_json,
                    ])?;
                    inserted += changed as u32;
                }
            }
            tx.commit()?;
            Ok(inserted)
        })
    }
}

fn init_schema(conn: &mut Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS matches (
            match_id       TEXT PRIMARY KEY,
            date_ms        INTEGER NOT NULL,
            queue_id       TEXT NOT NULL,
            map_id         TEXT NOT NULL,
            agent_id       TEXT NOT NULL,
            kills          INTEGER NOT NULL,
            deaths         INTEGER NOT NULL,
            assists        INTEGER NOT NULL,
            rounds_won     INTEGER NOT NULL,
            rounds_lost    INTEGER NOT NULL,
            won            INTEGER NOT NULL,
            teammates_json TEXT,
            enemies_json   TEXT,
            raw_json       TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_matches_date  ON matches(date_ms DESC);
        CREATE INDEX IF NOT EXISTS idx_matches_queue ON matches(queue_id, date_ms DESC);
        CREATE INDEX IF NOT EXISTS idx_matches_agent ON matches(agent_id, date_ms DESC);
        CREATE INDEX IF NOT EXISTS idx_matches_map   ON matches(map_id,   date_ms DESC);

        CREATE TABLE IF NOT EXISTS schema_meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        INSERT OR IGNORE INTO schema_meta (key, value) VALUES ('version', '1');
        "#,
    )
}

const INSERT_OR_IGNORE_SQL: &str = r#"
    INSERT OR IGNORE INTO matches (
        match_id, date_ms, queue_id, map_id, agent_id,
        kills, deaths, assists, rounds_won, rounds_lost, won,
        teammates_json, enemies_json, raw_json
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
"#;

const INSERT_OR_REPLACE_SQL: &str = r#"
    INSERT OR REPLACE INTO matches (
        match_id, date_ms, queue_id, map_id, agent_id,
        kills, deaths, assists, rounds_won, rounds_lost, won,
        teammates_json, enemies_json, raw_json
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
"#;

struct Row {
    match_id: String,
    date_ms: i64,
    queue_id: String,
    map_id: String,
    agent_id: String,
    kills: i64,
    deaths: i64,
    assists: i64,
    rounds_won: i64,
    rounds_lost: i64,
    won: bool,
    teammates_json: Option<String>,
    enemies_json: Option<String>,
    raw_json: String,
}

/// Pull the indexed columns out of one match summary JSON. Returns None
/// for entries missing matchId / dateMs / queueId — those would either
/// crash the insert (PK) or pollute results (rows with date_ms=0 sink to
/// the tail of every list; rows with empty queue_id surface as a phantom
/// "Custom" option in the queue-filter dropdown).
fn extract_row(entry: &Value) -> Option<Row> {
    let match_id = entry.get("matchId")?.as_str()?.to_string();
    if match_id.is_empty() {
        return None;
    }
    let date_ms = entry.get("dateMs").and_then(|v| v.as_i64())?;
    if date_ms <= 0 {
        return None;
    }
    let queue_id = entry.get("queueId").and_then(|v| v.as_str())?.to_string();
    if queue_id.is_empty() {
        return None;
    }
    let map_id = entry
        .get("map")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let agent_id = entry
        .get("agent")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let kills = entry.get("kills").and_then(|v| v.as_i64()).unwrap_or(0);
    let deaths = entry.get("deaths").and_then(|v| v.as_i64()).unwrap_or(0);
    let assists = entry.get("assists").and_then(|v| v.as_i64()).unwrap_or(0);
    let rounds_won = entry
        .get("roundsWon")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let rounds_lost = entry
        .get("roundsLost")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let won = entry
        .get("won")
        .and_then(|v| v.as_bool())
        .unwrap_or_else(|| entry.get("won").and_then(|v| v.as_i64()).unwrap_or(0) != 0);
    let teammates_json = entry.get("teammates").map(|v| v.to_string());
    let enemies_json = entry.get("enemies").map(|v| v.to_string());
    let raw_json = entry.to_string();

    Some(Row {
        match_id,
        date_ms,
        queue_id,
        map_id,
        agent_id,
        kills,
        deaths,
        assists,
        rounds_won,
        rounds_lost,
        won,
        teammates_json,
        enemies_json,
        raw_json,
    })
}

// ============================================================================
// Tauri commands
// ============================================================================

#[tauri::command]
pub async fn match_history_put(
    app: AppHandle,
    db: tauri::State<'_, MatchDb>,
    entry: Value,
) -> Result<bool, String> {
    let row = extract_row(&entry).ok_or("missing matchId")?;
    db.with_conn(&app, |conn| {
        let pre: i64 = conn.query_row(
            "SELECT COUNT(*) FROM matches WHERE match_id = ?1",
            params![row.match_id],
            |r| r.get(0),
        )?;
        conn.execute(
            INSERT_OR_REPLACE_SQL,
            params![
                row.match_id,
                row.date_ms,
                row.queue_id,
                row.map_id,
                row.agent_id,
                row.kills,
                row.deaths,
                row.assists,
                row.rounds_won,
                row.rounds_lost,
                row.won as i64,
                row.teammates_json,
                row.enemies_json,
                row.raw_json,
            ],
        )?;
        Ok(pre == 0)
    })
}

#[tauri::command]
pub async fn match_history_put_many(
    app: AppHandle,
    db: tauri::State<'_, MatchDb>,
    entries: Vec<Value>,
) -> Result<u32, String> {
    db.with_conn(&app, |conn| {
        let tx = conn.transaction()?;
        let mut new_count = 0u32;
        {
            let mut stmt = tx.prepare(INSERT_OR_REPLACE_SQL)?;
            let mut exists_stmt =
                tx.prepare("SELECT 1 FROM matches WHERE match_id = ?1")?;
            for entry in entries {
                let row = match extract_row(&entry) {
                    Some(r) => r,
                    None => continue,
                };
                let was_new = exists_stmt
                    .query_row(params![row.match_id], |_| Ok(()))
                    .optional()?
                    .is_none();
                stmt.execute(params![
                    row.match_id,
                    row.date_ms,
                    row.queue_id,
                    row.map_id,
                    row.agent_id,
                    row.kills,
                    row.deaths,
                    row.assists,
                    row.rounds_won,
                    row.rounds_lost,
                    row.won as i64,
                    row.teammates_json,
                    row.enemies_json,
                    row.raw_json,
                ])?;
                if was_new {
                    new_count += 1;
                }
            }
        }
        tx.commit()?;
        Ok(new_count)
    })
}

#[tauri::command]
pub async fn match_history_list(
    app: AppHandle,
    db: tauri::State<'_, MatchDb>,
    limit: Option<u32>,
    offset: Option<u32>,
    queue_id: Option<String>,
) -> Result<Value, String> {
    // Hard cap so a caller that forgets the limit can't materialize the
    // whole table. 5000 is more than any current view needs (WrappedPage
    // asks for 1000, Party for 200, Home pages at PAGE_SIZE intervals).
    let lim = limit.unwrap_or(5000).min(5000) as i64;
    let off = offset.unwrap_or(0) as i64;
    db.with_conn(&app, |conn| {
        // Total count for the same filter (so the frontend can show
        // "X of Y matches" if it wants).
        let total: i64 = match queue_id.as_deref() {
            Some(q) => conn.query_row(
                "SELECT COUNT(*) FROM matches WHERE queue_id = ?1",
                params![q],
                |r| r.get(0),
            )?,
            None => conn.query_row("SELECT COUNT(*) FROM matches", [], |r| r.get(0))?,
        };

        let sql = if queue_id.is_some() {
            "SELECT raw_json FROM matches WHERE queue_id = ?1 \
             ORDER BY date_ms DESC LIMIT ?2 OFFSET ?3"
        } else {
            "SELECT raw_json FROM matches \
             ORDER BY date_ms DESC LIMIT ?1 OFFSET ?2"
        };

        // We control raw_json (it's entry.to_string() at insert time), so a
        // parse failure means on-disk corruption — propagate loudly rather
        // than silently dropping rows (which would make `total` and
        // `matches.len()` diverge and break pagination math).
        let parse = |s: String| -> rusqlite::Result<Value> {
            serde_json::from_str(&s).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
            })
        };
        let mut stmt = conn.prepare(sql)?;
        let matches: Vec<Value> = if let Some(q) = queue_id.as_deref() {
            stmt.query_map(params![q, lim, off], |row| parse(row.get(0)?))?
                .collect::<rusqlite::Result<_>>()?
        } else {
            stmt.query_map(params![lim, off], |row| parse(row.get(0)?))?
                .collect::<rusqlite::Result<_>>()?
        };

        Ok(json!({
            "matches": matches,
            "total": total,
            "offset": off,
            "limit": lim,
        }))
    })
}

#[tauri::command]
pub async fn match_history_stats(
    app: AppHandle,
    db: tauri::State<'_, MatchDb>,
) -> Result<Value, String> {
    db.with_conn(&app, |conn| {
        // date_ms > 0 filter: legacy rows from before extract_row got strict
        // may still sit in the DB with date_ms=0; excluding them keeps
        // oldestMs honest (no row collapsing it to the unix epoch).
        let (total, oldest, newest): (i64, Option<i64>, Option<i64>) = conn.query_row(
            "SELECT COUNT(*), MIN(date_ms), MAX(date_ms) FROM matches WHERE date_ms > 0",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;
        Ok(json!({
            "total": total,
            "oldestMs": oldest,
            "newestMs": newest,
        }))
    })
}

#[tauri::command]
pub async fn match_history_distinct_queues(
    app: AppHandle,
    db: tauri::State<'_, MatchDb>,
) -> Result<Vec<String>, String> {
    db.with_conn(&app, |conn| {
        // Exclude empty queue_id (legacy rows pre-extract-row-strictness):
        // otherwise the dropdown shows a phantom "Custom" entry.
        let mut stmt = conn.prepare(
            "SELECT queue_id, COUNT(*) as c FROM matches \
             WHERE queue_id != '' GROUP BY queue_id ORDER BY c DESC",
        )?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })
}

#[tauri::command]
pub async fn match_history_aggregate(
    app: AppHandle,
    db: tauri::State<'_, MatchDb>,
    queue_id: Option<String>,
    limit: Option<u32>,
) -> Result<Value, String> {
    // Aggregates over the most-recent N rows (default 500). Caps the cost
    // when the DB has thousands of matches — tracker.gg-style "recent form"
    // is more useful than all-time anyway.
    let lim = limit.unwrap_or(500) as i64;
    db.with_conn(&app, |conn| {
        // Build a CTE that pre-filters to the window we care about, then
        // run three GROUP BY queries against it. Two SQL statements via
        // execute_batch isn't safe for parameterized queries, so just
        // build the WHERE inline.
        let (where_sql, params_vec): (&str, Vec<SqlValue>) = match queue_id.as_deref() {
            Some(q) => (
                "WHERE queue_id = ?1 ORDER BY date_ms DESC LIMIT ?2",
                vec![SqlValue::Text(q.to_string()), SqlValue::Integer(lim)],
            ),
            None => (
                "ORDER BY date_ms DESC LIMIT ?1",
                vec![SqlValue::Integer(lim)],
            ),
        };

        // By agent
        let by_agent_sql = format!(
            "WITH recent AS (SELECT * FROM matches {}) \
             SELECT agent_id, COUNT(*) AS games, \
                    SUM(won) AS wins, \
                    SUM(kills) AS k, SUM(deaths) AS d, SUM(assists) AS a \
             FROM recent GROUP BY agent_id ORDER BY games DESC",
            where_sql
        );
        let mut stmt = conn.prepare(&by_agent_sql)?;
        let by_agent: Vec<Value> = stmt
            .query_map(params_from_iter(params_vec.iter()), |r| {
                Ok(json!({
                    "agentId": r.get::<_, String>(0)?,
                    "games":   r.get::<_, i64>(1)?,
                    "wins":    r.get::<_, i64>(2)?,
                    "kills":   r.get::<_, i64>(3)?,
                    "deaths":  r.get::<_, i64>(4)?,
                    "assists": r.get::<_, i64>(5)?,
                }))
            })?
            .collect::<Result<_, _>>()?;
        drop(stmt);

        // By map
        let by_map_sql = format!(
            "WITH recent AS (SELECT * FROM matches {}) \
             SELECT map_id, COUNT(*) AS games, \
                    SUM(won) AS wins \
             FROM recent GROUP BY map_id ORDER BY games DESC",
            where_sql
        );
        let mut stmt = conn.prepare(&by_map_sql)?;
        let by_map: Vec<Value> = stmt
            .query_map(params_from_iter(params_vec.iter()), |r| {
                Ok(json!({
                    "mapId": r.get::<_, String>(0)?,
                    "games": r.get::<_, i64>(1)?,
                    "wins":  r.get::<_, i64>(2)?,
                }))
            })?
            .collect::<Result<_, _>>()?;
        drop(stmt);

        // Overall (one row)
        let overall_sql = format!(
            "WITH recent AS (SELECT * FROM matches {}) \
             SELECT COUNT(*) AS games, SUM(won) AS wins, \
                    SUM(kills) AS k, SUM(deaths) AS d, SUM(assists) AS a \
             FROM recent",
            where_sql
        );
        let overall: Value = conn.query_row(
            &overall_sql,
            params_from_iter(params_vec.iter()),
            |r| {
                Ok(json!({
                    "games":   r.get::<_, i64>(0)?,
                    "wins":    r.get::<_, Option<i64>>(1)?.unwrap_or(0),
                    "kills":   r.get::<_, Option<i64>>(2)?.unwrap_or(0),
                    "deaths":  r.get::<_, Option<i64>>(3)?.unwrap_or(0),
                    "assists": r.get::<_, Option<i64>>(4)?.unwrap_or(0),
                }))
            },
        )?;

        Ok(json!({
            "byAgent": by_agent,
            "byMap":   by_map,
            "overall": overall,
            "limit":   lim,
            "queueId": queue_id,
        }))
    })
}

/// One-shot import of the legacy match-cache.json blob into SQLite. Idempotent:
/// guarded by a `schema_meta.json_imported` flag so it runs at most once per
/// installation. The old file is renamed (not deleted) so a user can recover
/// it if migration corrupts something.
///
/// Called from lib.rs setup() — must run *after* `MatchDb` is `.manage()`d
/// but before any frontend invoke can land on the new commands.
pub fn migrate_from_json(app: &AppHandle, db: &MatchDb) {
    use crate::riot::logging::{log_error, log_info};
    use std::time::{SystemTime, UNIX_EPOCH};

    // Already migrated?
    match db.meta_get(app, "json_imported") {
        Ok(Some(_)) => return,
        Ok(None) => {}
        Err(e) => {
            log_error(&format!("[MatchDb] meta_get(json_imported) failed: {}", e));
            return;
        }
    }

    let json_path = match cache_path(app, "match-cache.json") {
        Ok(p) => p,
        Err(e) => {
            log_error(&format!("[MatchDb] cache_path: {}", e));
            return;
        }
    };
    if !json_path.exists() {
        // Fresh install — no migration needed; mark done so we don't keep
        // checking on every launch.
        let _ = db.meta_set(app, "json_imported", "skipped-no-file");
        return;
    }

    // Both error arms mark the migration as terminally failed so we don't
    // re-read + re-log the same broken file on every subsequent launch.
    let body = match std::fs::read_to_string(&json_path) {
        Ok(s) => s,
        Err(e) => {
            log_error(&format!("[MatchDb] read match-cache.json: {}", e));
            let _ = db.meta_set(app, "json_imported", "failed-read");
            return;
        }
    };
    let map: std::collections::HashMap<String, Value> = match serde_json::from_str(&body) {
        Ok(m) => m,
        Err(e) => {
            log_error(&format!("[MatchDb] parse match-cache.json: {}", e));
            let _ = db.meta_set(app, "json_imported", "failed-parse");
            return;
        }
    };
    let entries: Vec<Value> = map.into_values().collect();
    let entry_count = entries.len();

    match db.import_entries(app, &entries) {
        Ok(inserted) => {
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let backup = json_path.with_extension(format!("json.migrated-{}", ts));
            // Rename is best-effort — even if it fails, the json_imported flag
            // keeps us from re-running, and a leftover match-cache.json is
            // harmless (it just sits unread).
            let rename_note = match std::fs::rename(&json_path, &backup) {
                Ok(_) => format!("renamed to {}", backup.display()),
                Err(e) => format!("rename failed: {}", e),
            };
            log_info(&format!(
                "[MatchDb] imported {}/{} matches from match-cache.json; {}",
                inserted, entry_count, rename_note
            ));
            let _ = db.meta_set(app, "json_imported", &ts.to_string());
        }
        Err(e) => log_error(&format!("[MatchDb] import_entries failed: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fresh_db() -> Connection {
        let mut c = Connection::open_in_memory().unwrap();
        init_schema(&mut c).unwrap();
        c
    }

    fn sample(id: &str, date: i64, queue: &str, agent: &str, k: i64, d: i64, won: bool) -> Value {
        json!({
            "matchId": id,
            "dateMs": date,
            "queueId": queue,
            "map": "/Game/Maps/Bonsai/Bonsai",
            "agent": agent,
            "kills": k,
            "deaths": d,
            "assists": 5,
            "roundsWon": if won { 13 } else { 11 },
            "roundsLost": if won { 11 } else { 13 },
            "won": won,
        })
    }

    fn insert(c: &mut Connection, e: &Value) {
        let r = extract_row(e).unwrap();
        c.execute(
            INSERT_OR_REPLACE_SQL,
            params![
                r.match_id,
                r.date_ms,
                r.queue_id,
                r.map_id,
                r.agent_id,
                r.kills,
                r.deaths,
                r.assists,
                r.rounds_won,
                r.rounds_lost,
                r.won as i64,
                r.teammates_json,
                r.enemies_json,
                r.raw_json,
            ],
        )
        .unwrap();
    }

    #[test]
    fn sorts_by_date_descending() {
        let mut c = fresh_db();
        insert(&mut c, &sample("a", 100, "competitive", "jett", 10, 5, true));
        insert(&mut c, &sample("b", 300, "competitive", "jett", 8, 6, false));
        insert(&mut c, &sample("c", 200, "competitive", "reyna", 15, 4, true));
        let ids: Vec<String> = c
            .prepare("SELECT match_id FROM matches ORDER BY date_ms DESC")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(ids, vec!["b", "c", "a"]);
    }

    #[test]
    fn filters_by_queue_id() {
        let mut c = fresh_db();
        insert(&mut c, &sample("a", 100, "competitive", "jett", 10, 5, true));
        insert(&mut c, &sample("b", 200, "spikerush", "phoenix", 6, 3, true));
        insert(&mut c, &sample("c", 300, "competitive", "reyna", 15, 4, false));
        let comp: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM matches WHERE queue_id = 'competitive'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(comp, 2);
    }

    #[test]
    fn rejects_entries_missing_required_fields() {
        // matchId / dateMs / queueId are all required — anything else is
        // numeric-default-OK. Each missing piece independently rejects.
        assert!(extract_row(&json!({ "dateMs": 100, "kills": 5 })).is_none()); // no matchId
        assert!(extract_row(&json!({ "matchId": "x", "queueId": "comp" })).is_none()); // no dateMs
        assert!(extract_row(&json!({ "matchId": "x", "dateMs": 100 })).is_none()); // no queueId
        assert!(extract_row(&json!({ "matchId": "x", "dateMs": 0, "queueId": "comp" })).is_none()); // zero dateMs
        assert!(extract_row(&json!({ "matchId": "x", "dateMs": 100, "queueId": "" })).is_none()); // empty queueId

        // Minimal valid shape — numeric fields default to 0.
        let r = extract_row(&json!({ "matchId": "x", "dateMs": 100, "queueId": "competitive" })).unwrap();
        assert_eq!(r.kills, 0);
        assert_eq!(r.deaths, 0);
    }
}
