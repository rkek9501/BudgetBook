use chrono::{FixedOffset, Utc};

fn kst() -> FixedOffset {
    FixedOffset::east_opt(9 * 3600).expect("valid offset")
}

/// `2026-11-16T00:30:00+09:00`
pub fn now_kst_iso() -> String {
    Utc::now()
        .with_timezone(&kst())
        .format("%Y-%m-%dT%H:%M:%S%:z")
        .to_string()
}

/// `20261116`
pub fn today_kst_compact() -> String {
    Utc::now()
        .with_timezone(&kst())
        .format("%Y%m%d")
        .to_string()
}
