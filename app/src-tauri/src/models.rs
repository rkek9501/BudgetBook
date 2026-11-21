use serde::{Deserialize, Serialize};

macro_rules! model {
    ($name:ident { $($f:ident : $t:ty),* $(,)? }) => {
        #[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
        #[serde(rename_all = "camelCase")]
        pub struct $name { $(pub $f: $t),* }
    };
}

model!(Category { id: i64, name: String, color: String });
model!(Expense { id: String, date: String, description: String, amount: i64, category_id: i64 });
model!(NewExpense { date: String, description: String, amount: i64, category_id: i64 });
model!(ExpenseUpdate { id: String, description: String, amount: i64, category_id: i64 });
model!(CategoryUsage { expense_count: i64, note_count: i64 });
model!(CategoryNote { month: String, category_id: i64, note: String });
model!(NewCategory { name: String, color: String });
model!(FixedItem { id: String, name: String, sort_order: i64 });
model!(FixedAmount { item_id: String, month: String, amount: i64 });
model!(FixedData { items: Vec<FixedItem>, amounts: Vec<FixedAmount> });
model!(PeriodData {
    expenses: Vec<Expense>,
    no_expense_days: Vec<String>,
    notes: Vec<CategoryNote>,
    fixed_amounts: Vec<FixedAmount>,
});
model!(Settings { accounting_start_day: i64, theme: String, appearance: String });
model!(Bootstrap { settings: Settings, categories: Vec<Category>, is_fresh: bool });
model!(DbStatus { ok: bool, error: Option<String> });
model!(BackupInfo { file_name: String, created_at: String, expense_count: i64 });
model!(ImportCategory { source_id: i64, name: String, color: String });
model!(ImportExpense { date: String, description: String, amount: i64, source_category_id: i64 });
model!(ImportFixedAmount { month: String, amount: i64 });
model!(ImportFixedItem { name: String, sort_order: i64, amounts: Vec<ImportFixedAmount> });
model!(ImportNote { month: String, source_category_id: i64, note: String });
model!(ImportPayload {
    categories: Vec<ImportCategory>,
    expenses: Vec<ImportExpense>,
    no_expense_days: Vec<String>,
    fixed_items: Vec<ImportFixedItem>,
    notes: Vec<ImportNote>,
    accounting_start_day: i64,
});
model!(ImportResult {
    categories: i64,
    expenses: i64,
    no_expense_days: i64,
    fixed_items: i64,
    notes: i64,
});
