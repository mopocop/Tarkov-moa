// EFT log watcher.
//
// Watches the EFT logs dir recursively. For each `*application.log` it sees
// (existing or newly created), tail-follows the file and parses three event
// types out of the stream:
//
//   - "application|GameStarted"               → raid-started   {}
//   - "Got notification | UserMatchOver"      → raid-ended     { location, shortId }
//   - "Got notification | ChatMessageReceived" with templateId.type in {10,11,12}
//                                             → quest-event   { status, templateId }
//
// The notification lines are followed by a multi-line JSON payload starting
// with `{` at column 0 and ending with `}` at column 0. We buffer between
// those markers and serde_json::from_str the result.
//
// Last-processed file paths + byte offsets are persisted to
// `<app-data>/log_watcher_state.json` so restart doesn't re-emit events for
// sessions already seen. Malformed JSON is logged to stderr and skipped — the
// watcher keeps running.

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use notify::{EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::eft_config;

const POLL_INTERVAL: Duration = Duration::from_millis(400);
const STATE_FILE: &str = "log_watcher_state.json";

static CANCEL: OnceLock<Mutex<Option<Arc<AtomicBool>>>> = OnceLock::new();

fn cancel_cell() -> &'static Mutex<Option<Arc<AtomicBool>>> {
    CANCEL.get_or_init(|| Mutex::new(None))
}

#[derive(Serialize, Clone)]
struct RaidEnded {
    location: String,
    #[serde(rename = "shortId")]
    short_id: String,
}

#[derive(Serialize, Clone)]
struct QuestEvent {
    status: &'static str,
    #[serde(rename = "templateId")]
    template_id: String,
}

type Offsets = HashMap<PathBuf, u64>;

fn load_state(state_path: &Path) -> Offsets {
    fs::read_to_string(state_path)
        .ok()
        .and_then(|s| serde_json::from_str::<HashMap<String, u64>>(&s).ok())
        .map(|m| m.into_iter().map(|(k, v)| (PathBuf::from(k), v)).collect())
        .unwrap_or_default()
}

fn save_state(state_path: &Path, offsets: &Offsets) {
    let serializable: HashMap<String, u64> = offsets
        .iter()
        .map(|(k, v)| (k.to_string_lossy().into_owned(), *v))
        .collect();
    if let Ok(json) = serde_json::to_string(&serializable) {
        if let Some(parent) = state_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(state_path, json);
    }
}

pub(crate) fn is_application_log(path: &Path) -> bool {
    // Despite the historical name, this predicate now matches BOTH log file
    // types our parser cares about:
    //
    //   *application_<N>.log        — raid-started (`GameStarted` marker)
    //   *push-notifications_<N>.log — quest-event (`ChatMessageReceived` marker)
    //
    // EFT 1.0.x ships notification events in `push-notifications` files, not
    // `application`. The token-boundary check (space or underscore before the
    // keyword) keeps us from matching unrelated files like "deduplication.log".
    if path.extension().and_then(|e| e.to_str()) != Some("log") {
        return false;
    }
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return false;
    };
    name.contains(" application")
        || name.contains("_application")
        || name.contains(" push-notifications")
        || name.contains("_push-notifications")
}

fn classify_template_type(t: i64) -> Option<&'static str> {
    match t {
        10 => Some("Started"),
        11 => Some("Failed"),
        12 => Some("Finished"),
        _ => None,
    }
}

fn emit_quest_from_json(app: &AppHandle, json: &Value) {
    // EFT 1.0+ ChatMessageReceived payload shape:
    //   {
    //     "type": "new_message",
    //     "message": {
    //       "type": 12,                                       <- 10|11|12 = Started|Failed|Finished
    //       "templateId": "657315ddab5a49b71f098853 successMessageText"
    //     }
    //   }
    //
    // templateId is a STRING (not an object) of the form "<24hex-id> <suffix>".
    // The first whitespace-delimited token is the tarkov.dev task id.
    //
    // We fall back to root-level lookup if there is no `message` wrapper, to
    // tolerate older log shapes if they reappear.
    let message = json.get("message").unwrap_or(json);
    let type_n = message.get("type").and_then(|v| v.as_i64());
    let raw_template_id = message.get("templateId").and_then(|v| v.as_str());

    if let (Some(raw), Some(t)) = (raw_template_id, type_n) {
        if let Some(status) = classify_template_type(t) {
            let id = raw.split_whitespace().next().unwrap_or(raw);
            let _ = app.emit(
                "quest-event",
                QuestEvent {
                    status,
                    template_id: id.to_string(),
                },
            );
        }
    }
}

fn emit_raid_ended_from_json(app: &AppHandle, json: &Value) {
    let location = json
        .get("location")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let short_id = json
        .get("shortId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let _ = app.emit("raid-ended", RaidEnded { location, short_id });
}

/// Process one file from `start_offset` to EOF. Returns new offset.
pub fn process_file(
    app: &AppHandle,
    path: &Path,
    start_offset: u64,
) -> std::io::Result<u64> {
    let mut file = File::open(path)?;
    let len = file.metadata()?.len();
    // If file was truncated/rotated below our offset, restart from 0.
    let start = if start_offset > len { 0 } else { start_offset };
    file.seek(SeekFrom::Start(start))?;
    let mut reader = BufReader::new(file);

    // Pending parser state: when we see a marker line, we look for a JSON
    // block on subsequent lines. None = idle.
    #[derive(Clone, Copy)]
    enum Pending {
        QuestEvent,
        RaidEnded,
    }
    let mut pending: Option<Pending> = None;
    let mut json_buf = String::new();
    let mut in_json = false;
    let mut bytes_read: u64 = 0;
    let mut line = String::new();

    loop {
        line.clear();
        let n = reader.read_line(&mut line)?;
        if n == 0 {
            break;
        }
        bytes_read += n as u64;

        if in_json {
            json_buf.push_str(&line);
            if line.starts_with('}') {
                // Try parse, emit, reset.
                match serde_json::from_str::<Value>(&json_buf) {
                    Ok(v) => match pending {
                        Some(Pending::QuestEvent) => emit_quest_from_json(app, &v),
                        Some(Pending::RaidEnded) => emit_raid_ended_from_json(app, &v),
                        None => {}
                    },
                    Err(e) => {
                        eprintln!(
                            "[log_watcher] malformed JSON in {}: {}",
                            path.display(),
                            e
                        );
                    }
                }
                in_json = false;
                pending = None;
                json_buf.clear();
            }
            continue;
        }

        if let Some(_) = pending {
            if line.starts_with('{') {
                in_json = true;
                json_buf.clear();
                json_buf.push_str(&line);
                continue;
            }
            // Sometimes the JSON block doesn't materialize; drop pending if we
            // see another marker-bearing line. Otherwise keep waiting briefly.
        }

        if line.contains("application|GameStarted") {
            let _ = app.emit("raid-started", serde_json::json!({}));
            pending = None;
        } else if line.contains("Got notification | UserMatchOver") {
            pending = Some(Pending::RaidEnded);
        } else if line.contains("Got notification | ChatMessageReceived") {
            pending = Some(Pending::QuestEvent);
        }
    }

    Ok(start + bytes_read)
}

fn tail_loop(app: AppHandle, state_path: PathBuf, offsets: Arc<Mutex<Offsets>>, path: PathBuf, cancel: Arc<AtomicBool>) {
    loop {
        if cancel.load(Ordering::Relaxed) {
            return;
        }
        let start = offsets
            .lock()
            .ok()
            .and_then(|m| m.get(&path).copied())
            .unwrap_or(0);
        match process_file(&app, &path, start) {
            Ok(new_offset) => {
                if new_offset != start {
                    if let Ok(mut m) = offsets.lock() {
                        m.insert(path.clone(), new_offset);
                        save_state(&state_path, &m);
                    }
                }
            }
            Err(e) => {
                // File might not be there yet, or transient IO. Don't spin.
                eprintln!("[log_watcher] read {} failed: {}", path.display(), e);
                if cancel.load(Ordering::Relaxed) {
                    return;
                }
                thread::sleep(Duration::from_secs(2));
            }
        }
        if cancel.load(Ordering::Relaxed) {
            return;
        }
        thread::sleep(POLL_INTERVAL);
    }
}

fn scan_existing(
    app: &AppHandle,
    state_path: &Path,
    offsets: &Arc<Mutex<Offsets>>,
    tailed: &Arc<Mutex<Vec<PathBuf>>>,
    root: &Path,
    cancel: Arc<AtomicBool>,
) {
    let walker = match fs::read_dir(root) {
        Ok(it) => it,
        Err(_) => return,
    };
    for entry in walker.flatten() {
        let p = entry.path();
        if p.is_dir() {
            scan_existing(app, state_path, offsets, tailed, &p, cancel.clone());
        } else if is_application_log(&p) {
            start_tail(app.clone(), state_path.to_path_buf(), offsets.clone(), tailed.clone(), p, cancel.clone());
        }
    }
}

fn start_tail(
    app: AppHandle,
    state_path: PathBuf,
    offsets: Arc<Mutex<Offsets>>,
    tailed: Arc<Mutex<Vec<PathBuf>>>,
    path: PathBuf,
    cancel: Arc<AtomicBool>,
) {
    if let Ok(mut t) = tailed.lock() {
        if t.contains(&path) {
            return;
        }
        t.push(path.clone());
    }
    thread::spawn(move || {
        tail_loop(app, state_path, offsets, path, cancel);
    });
}

/// Restart the watcher with a specific logs directory. Signals any threads
/// from a previous `restart` call to exit cooperatively, then spawns fresh
/// tail/watcher threads for the new directory.
pub fn restart(app: AppHandle, logs_dir: PathBuf) {
    let cancel = {
        let mut cell = cancel_cell().lock().unwrap();
        if let Some(old) = cell.take() {
            old.store(true, Ordering::Relaxed);
        }
        let cancel = Arc::new(AtomicBool::new(false));
        *cell = Some(cancel.clone());
        cancel
    };

    thread::spawn(move || {
        let state_path = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(STATE_FILE);
        let offsets = Arc::new(Mutex::new(load_state(&state_path)));
        let tailed: Arc<Mutex<Vec<PathBuf>>> = Arc::new(Mutex::new(Vec::new()));

        // Tail every existing application.log under the logs root. The persisted
        // offset ensures we don't re-emit events for sessions already processed.
        scan_existing(&app, &state_path, &offsets, &tailed, &logs_dir, cancel.clone());

        // Watch for newly-created log files.
        let app_for_watcher = app.clone();
        let state_for_watcher = state_path.clone();
        let offsets_for_watcher = offsets.clone();
        let tailed_for_watcher = tailed.clone();
        let cancel_for_watcher = cancel.clone();
        let mut watcher = match notify::recommended_watcher(
            move |res: notify::Result<notify::Event>| match res {
                Ok(ev) => {
                    if matches!(ev.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                        for path in ev.paths {
                            if is_application_log(&path) {
                                start_tail(
                                    app_for_watcher.clone(),
                                    state_for_watcher.clone(),
                                    offsets_for_watcher.clone(),
                                    tailed_for_watcher.clone(),
                                    path,
                                    cancel_for_watcher.clone(),
                                );
                            }
                        }
                    }
                }
                Err(e) => eprintln!("[log_watcher] notify error: {}", e),
            },
        ) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[log_watcher] failed to start notify watcher: {}", e);
                return;
            }
        };

        if let Err(e) = watcher.watch(&logs_dir, RecursiveMode::Recursive) {
            eprintln!("[log_watcher] failed to watch {}: {}", logs_dir.display(), e);
            return;
        }

        // Keep watcher alive until cancelled.
        loop {
            if cancel.load(Ordering::Relaxed) {
                return;
            }
            thread::sleep(Duration::from_secs(60));
        }
    });
}

/// Convenience wrapper for bootstrap. Calls `restart(app, logs_dir)` on `Ok`,
/// or logs the error on `Err` without spawning anything.
pub fn start_with_resolver(app: AppHandle, logs_dir: Result<PathBuf, String>) {
    match logs_dir {
        Ok(p) => restart(app, p),
        Err(e) => eprintln!("[log_watcher] no logs dir: {}", e),
    }
}

/// Walk every `*application.log` under the EFT logs dir, sorted by mtime
/// (oldest first), and re-process each from offset 0 through the same parser
/// that the live watcher uses. Used by the `replay_past_logs` Tauri command.
///
/// Returns Ok(count_of_files_processed). Per-file IO errors are logged to
/// stderr and skipped — a single bad file doesn't abort the whole replay.
pub fn replay_past_logs(app: &AppHandle, logs_dir: &Path) -> Result<usize, String> {
    fn collect(dir: &Path, out: &mut Vec<(PathBuf, std::time::SystemTime)>) {
        let entries = match fs::read_dir(dir) {
            Ok(it) => it,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                collect(&p, out);
            } else if is_application_log(&p) {
                let mtime = entry
                    .metadata()
                    .and_then(|m| m.modified())
                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                out.push((p, mtime));
            }
        }
    }

    let mut files: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();
    collect(logs_dir, &mut files);
    files.sort_by_key(|(_, t)| *t);

    let mut processed = 0usize;
    for (path, _) in &files {
        match process_file(app, path, 0) {
            Ok(_) => {
                processed += 1;
            }
            Err(e) => {
                eprintln!("[log_watcher] replay skip {}: {}", path.display(), e);
            }
        }
    }
    Ok(processed)
}

#[tauri::command]
pub fn replay_past_logs_cmd(
    app: AppHandle,
    state: State<eft_config::EftConfigState>,
) -> Result<usize, String> {
    let cfg = state.0.lock().map_err(|e| e.to_string())?.clone();
    let logs_dir = eft_config::resolve_logs_dir(&cfg)?;
    replay_past_logs(&app, &logs_dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_real_eft_filenames() {
        // Verbatim shapes seen on Moacir's S:\Games\Escape From Tarkov\Logs
        // (EFT 1.0.5.0.45272, 2026-05-28).
        let cases = [
            "2026.05.28_15-59-03_1.0.5.0.45272 application_0.log",
            "2026.05.28_15-59-03_1.0.5.0.45272 application_001.log",
            "2026.05.28_15-59-03_1.0.5.0.45272 application_000.log",
            "2026.05.27_22-44-11_1.0.5.0.45272_application_0.log",
            "2026.05.27_22-44-11_1.0.5.0.45272 application.log",
            // push-notifications variants — where quest-event marker actually lives
            "2026.05.28_15-59-03_1.0.5.0.45272 push-notifications_000.log",
            "2026.05.28_15-59-03_1.0.5.0.45272_push-notifications_0.log",
        ];
        for c in cases {
            assert!(
                is_application_log(&PathBuf::from(c)),
                "should match: {}",
                c
            );
        }
    }

    #[test]
    fn rejects_non_application_logs() {
        let cases = [
            "2026.05.28_15-59-03_1.0.5.0.45272 backend_0.log",
            "2026.05.28_15-59-03_1.0.5.0.45272 output_000.log",
            "2026.05.28_15-59-03_1.0.5.0.45272 spatial-audio_0.log",
            "2026.05.28_15-59-03_1.0.5.0.45272 errors_000.log",
            "2026.05.28_15-59-03_1.0.5.0.45272 network-messages_000.log",
            "2026.05.28_15-59-03_1.0.5.0.45272 application_0.txt", // wrong ext
            "deduplication.log",                                    // word boundary check
        ];
        for c in cases {
            assert!(
                !is_application_log(&PathBuf::from(c)),
                "should reject: {}",
                c
            );
        }
    }

    #[test]
    fn parses_finished_quest_event_json() {
        // Exact JSON shape verified from Moacir's push-notifications log for
        // the "First in Line" quest completion. message.type=12 maps to
        // "Finished". The templateId string carries the task id followed by
        // a space-separated suffix tag we strip off.
        let raw = r#"{
            "type": "new_message",
            "eventId": "6a18988bc2b596187c067b8d",
            "message": {
                "type": 12,
                "templateId": "657315ddab5a49b71f098853 successMessageText"
            }
        }"#;
        let v: serde_json::Value = serde_json::from_str(raw).unwrap();
        // We can't easily invoke emit_quest_from_json without an AppHandle,
        // so test the extraction logic directly: it must split off the suffix.
        let message = v.get("message").unwrap();
        let t = message.get("type").and_then(|x| x.as_i64()).unwrap();
        let raw_id = message.get("templateId").and_then(|x| x.as_str()).unwrap();
        let id = raw_id.split_whitespace().next().unwrap();
        assert_eq!(t, 12);
        assert_eq!(classify_template_type(t), Some("Finished"));
        assert_eq!(id, "657315ddab5a49b71f098853");
    }

    #[test]
    fn parses_started_quest_event_json() {
        let raw = r#"{
            "type": "new_message",
            "message": {
                "type": 10,
                "templateId": "5967733e86f774602332fc84 description"
            }
        }"#;
        let v: serde_json::Value = serde_json::from_str(raw).unwrap();
        let message = v.get("message").unwrap();
        let t = message.get("type").and_then(|x| x.as_i64()).unwrap();
        let raw_id = message.get("templateId").and_then(|x| x.as_str()).unwrap();
        let id = raw_id.split_whitespace().next().unwrap();
        assert_eq!(t, 10);
        assert_eq!(classify_template_type(t), Some("Started"));
        assert_eq!(id, "5967733e86f774602332fc84");
    }
}
