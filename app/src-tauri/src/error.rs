use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    DbUnavailable(String),
    #[error("{0}")]
    DuplicateName(String),
    #[error("{0}")]
    CategoryInUse(String),
    #[error("{0}")]
    LastCategory(String),
    #[error("{0}")]
    DayHasExpenses(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    InvalidInput(String),
    #[error("{0}")]
    Io(String),
    #[error("{0}")]
    Sqlite(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::DbUnavailable(_) => "db_unavailable",
            AppError::DuplicateName(_) => "duplicate_name",
            AppError::CategoryInUse(_) => "category_in_use",
            AppError::LastCategory(_) => "last_category",
            AppError::DayHasExpenses(_) => "day_has_expenses",
            AppError::NotFound(_) => "not_found",
            AppError::InvalidInput(_) => "invalid_input",
            AppError::Io(_) => "io",
            AppError::Sqlite(_) => "sqlite",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut st = s.serialize_struct("AppError", 2)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Sqlite(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_code_and_message() {
        let v = serde_json::to_value(AppError::NotFound("none".into())).unwrap();
        assert_eq!(
            v,
            serde_json::json!({"code": "not_found", "message": "none"})
        );
    }
}
