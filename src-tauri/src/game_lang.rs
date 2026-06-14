// Reads EFT's in-game UI language so the app can default to it.
//
// EFT stores its settings under %APPDATA%\Battlestate Games\Escape from
// Tarkov\Settings\Game.ini — a JSON-shaped file despite the .ini extension —
// with a line like:  "Language": "en",
//
// This dir is in Roaming AppData regardless of the install drive (same as the
// Screenshots dir), so detection is independent of the configured install root.
// EFT uses some non-standard codes (jp, ch, po, ge, …); we return the RAW
// value and let the frontend normalize it to our supported locales.

use std::env;
use std::fs;
use std::path::PathBuf;

fn game_ini_path() -> Option<PathBuf> {
    let appdata = env::var("APPDATA").ok()?;
    let p = PathBuf::from(appdata)
        .join("Battlestate Games")
        .join("Escape from Tarkov")
        .join("Settings")
        .join("Game.ini");
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

/// Extract the `"Language"` value from Game.ini's JSON-shaped body.
/// Returns the raw EFT code (e.g. "en", "jp", "ch") or None if absent.
pub fn parse_language(contents: &str) -> Option<String> {
    for line in contents.lines() {
        let l = line.trim();
        if let Some(rest) = l.strip_prefix("\"Language\"") {
            // rest looks like: : "en",
            let after = rest.trim_start_matches(|c| c == ':' || c == ' ' || c == '\t');
            let v = after.trim_start_matches('"');
            if let Some(end) = v.find('"') {
                let code = v[..end].trim();
                if !code.is_empty() {
                    return Some(code.to_string());
                }
            }
        }
    }
    None
}

#[tauri::command]
pub fn get_game_language() -> Option<String> {
    let p = game_ini_path()?;
    let contents = fs::read_to_string(&p).ok()?;
    parse_language(&contents)
}

#[cfg(test)]
mod tests {
    use super::parse_language;

    #[test]
    fn parses_standard_language_line() {
        let ini = "{\n  \"Language\": \"en\",\n  \"Other\": 1\n}";
        assert_eq!(parse_language(ini).as_deref(), Some("en"));
    }

    #[test]
    fn parses_quirky_eft_codes() {
        assert_eq!(
            parse_language("  \"Language\": \"jp\",").as_deref(),
            Some("jp")
        );
        assert_eq!(
            parse_language("\"Language\":\"ch\"").as_deref(),
            Some("ch")
        );
    }

    #[test]
    fn returns_none_when_absent_or_empty() {
        assert_eq!(parse_language("{ \"Volume\": 50 }"), None);
        assert_eq!(parse_language("  \"Language\": \"\","), None);
    }
}
