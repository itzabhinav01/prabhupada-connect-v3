use std::sync::Mutex;

use rusqlite::Connection;

use crate::db::corpus::CorpusPool;

pub struct AppState {
    pub corpus_pool: CorpusPool,
    pub user_db: Mutex<Connection>,
    pub user_books_db: Mutex<Connection>,
}

impl AppState {
    /// Checks out a pooled read-only corpus connection, mapping pool errors
    /// into a command-friendly `String`.
    pub fn corpus_conn(
        &self,
    ) -> Result<r2d2::PooledConnection<r2d2_sqlite::SqliteConnectionManager>, String> {
        self.corpus_pool.get().map_err(|e| e.to_string())
    }
}
