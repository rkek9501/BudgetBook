CREATE TABLE categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,   -- 삭제된 ID 재사용 안 함 (ISSUE-03)
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color       TEXT NOT NULL,                       -- '#RRGGBB' 대문자
  created_at  TEXT NOT NULL,                       -- ISO 8601, +09:00
  updated_at  TEXT NOT NULL
);

CREATE TABLE expenses (
  id          TEXT PRIMARY KEY,                    -- UUID
  date        TEXT NOT NULL,                       -- 'YYYY-MM-DD' (KST)
  description TEXT NOT NULL CHECK (length(trim(description)) > 0),
  amount      INTEGER NOT NULL CHECK (amount >= 0),
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_expenses_date ON expenses(date);

CREATE TABLE no_expense_days (
  date        TEXT PRIMARY KEY,                    -- 'YYYY-MM-DD'
  created_at  TEXT NOT NULL
);

CREATE TABLE fixed_expense_items (
  id          TEXT PRIMARY KEY,                    -- UUID
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  sort_order  INTEGER NOT NULL,                    -- 추가 순서
  created_at  TEXT NOT NULL
);

CREATE TABLE fixed_expense_amounts (
  item_id     TEXT NOT NULL REFERENCES fixed_expense_items(id) ON DELETE CASCADE,
  month       TEXT NOT NULL,                       -- 회계월 'YYYY-MM'
  amount      INTEGER NOT NULL CHECK (amount >= 0),
  PRIMARY KEY (item_id, month)
);

CREATE TABLE category_notes (
  month       TEXT NOT NULL,                       -- 회계월 'YYYY-MM'
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,  -- 병합은 삭제 전에 앱이 처리
  note        TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (month, category_id)
);

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,                    -- 'accounting_start_day', 'theme' 등
  value       TEXT NOT NULL
);
