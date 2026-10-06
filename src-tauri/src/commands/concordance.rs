use std::collections::HashMap;

use serde::Serialize;
use tauri::State;

use crate::db::corpus;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConcordanceBookCount {
    pub book_key: String,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConcordanceMatch {
    pub record_key: String,
    pub book_key: String,
    pub reference: Option<String>,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConcordanceResult {
    pub lemma: String,
    pub total: i64,
    pub by_book: Vec<ConcordanceBookCount>,
    pub matches: Vec<ConcordanceMatch>,
}

/// "Sanskrit Lemma & Grammatical Word Explorer" — every corpus occurrence
/// of a Synonyms-field lemma, grouped by book for frequency chips. Built
/// entirely on top of `search_corpus` (scoped to the Synonyms field, whole
/// word) rather than a new hand-rolled query, so it inherits the same
/// diacritic-folding and anglicized-spelling handling every other search
/// already has, instead of risking a second, subtly different matcher.
#[tauri::command]
pub fn get_concordance(state: State<AppState>, lemma: String) -> Result<ConcordanceResult, String> {
    let conn = state.corpus_conn()?;
    let response = corpus::search_corpus(
        &conn,
        corpus::SearchParams {
            query: lemma.clone(),
            scope: Some("synonyms".to_string()),
            exact_word: true,
            limit: Some(500),
            offset: Some(0),
            ..Default::default()
        },
    )?;

    let mut by_book: HashMap<String, i64> = HashMap::new();
    for hit in &response.hits {
        *by_book.entry(hit.book_key.clone()).or_insert(0) += 1;
    }
    let mut by_book_vec: Vec<ConcordanceBookCount> =
        by_book.into_iter().map(|(book_key, count)| ConcordanceBookCount { book_key, count }).collect();
    by_book_vec.sort_by(|a, b| b.count.cmp(&a.count));

    let matches = response
        .hits
        .into_iter()
        .map(|hit| ConcordanceMatch {
            record_key: hit.record_key,
            book_key: hit.book_key,
            reference: hit.reference,
            snippet: hit.snippet,
        })
        .collect();

    Ok(ConcordanceResult { lemma, total: response.total, by_book: by_book_vec, matches })
}
