//! Pure Rust core analyzers built on the duplicate-preserving AST.
//!
//! Contract highlights locked for Phase 3:
//! - analyzers operate on [`JsonValue`] only and have no Tauri, HTTP, frontend,
//!   Python, or dataframe dependency;
//! - flattened paths use Phase 2 dotted-path semantics and duplicate object keys
//!   are observed in encounter order;
//! - exact duplicate grouping uses compact AST JSON keys, skips null/empty
//!   strings/empty containers, and reports duplicate groups in first-seen order;
//! - field duplicate matching uses normalized patterns such as `users.[].id`,
//!   treats missing fields as absent, skips JSON null values, and lowercases only
//!   the comparison key when case-insensitive;
//! - min/max filled analysis chooses one candidate record array, counts ties in
//!   input order, and computes counts without pandas/dataframes.

pub mod duplicates;
pub mod minmax;
pub mod statistics;
pub mod structure;
pub mod values;

pub use duplicates::{
    DUPLICATES_MAX_MATCH_COMBINATIONS_PER_RECORD, DUPLICATES_MAX_MATCH_COMBINATIONS_PER_REQUEST,
    DuplicateCombinationLimitError, DuplicateCombinationLimitScope, ExactDuplicateGroup,
    ExactDuplicatesResult, FieldDuplicateGroup, FieldDuplicateSummary, FieldDuplicatesResult,
    analyze_advanced_field_duplicates, analyze_composite_duplicates, analyze_exact_duplicates,
    analyze_field_duplicates, validate_duplicate_combination_limits,
};
pub use minmax::{
    CountDistribution, MinMaxFilledResult, MinMaxRecord, MinMaxStatistics, analyze_min_max_filled,
};
pub use statistics::{
    StatisticsAnalysis, StringLengthStats, TypeCount, ValueCount, ValueDistribution,
    analyze_statistics,
};
pub use structure::{
    ContainerSummary, SchemaNode, SchemaProperty, SchemaValue, StructureAnalysis, analyze_structure,
};
pub use values::{analyze_values, discover_values_fields};
