use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value as Json;

use crate::ast::JsonValue;
use crate::dto::{
    AdvancedFieldDuplicateGroup, AdvancedFieldDuplicatesResponse, CompositeDuplicateGroup,
    CompositeDuplicatesResponse, DuplicateFilter, DuplicateValueSummary, ParentItem,
};
use crate::json_ops::{path_to_pattern, safe_str};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExactDuplicatesResult {
    pub total_items: usize,
    pub unique_items: usize,
    pub duplicate_groups: usize,
    pub duplicates: Vec<ExactDuplicateGroup>,
    pub has_duplicates: bool,
    pub analysis_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExactDuplicateGroup {
    pub value: String,
    pub indexes: Vec<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FieldDuplicatesResult {
    pub field_path: String,
    pub total_items: usize,
    pub unique_values: usize,
    pub duplicate_count: usize,
    pub duplicates: Vec<FieldDuplicateGroup>,
    pub has_duplicates: bool,
    pub all_values_summary: Vec<FieldDuplicateSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FieldDuplicateGroup {
    pub value: String,
    pub count: usize,
    pub source_paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FieldDuplicateSummary {
    pub value: String,
    pub count: usize,
    pub is_duplicate: bool,
}

pub const DUPLICATES_MAX_MATCH_COMBINATIONS_PER_RECORD: usize = 10_000;
pub const DUPLICATES_MAX_MATCH_COMBINATIONS_PER_REQUEST: usize = 100_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DuplicateCombinationLimitScope {
    Record { record_index: usize },
    Request,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DuplicateCombinationLimitError {
    pub scope: DuplicateCombinationLimitScope,
    pub combination_count: usize,
    pub limit: usize,
}

/// Validate that composite duplicate field selection will not materialize too many
/// duplicate-key/array-value combinations before pagination can be applied.
pub fn validate_duplicate_combination_limits(
    value: &JsonValue,
    field_paths: &[String],
    per_record_limit: usize,
    request_limit: usize,
) -> Result<(), DuplicateCombinationLimitError> {
    let Some(records) = candidate_records(value) else {
        return Ok(());
    };

    let field_segments = field_paths
        .iter()
        .map(|field| pattern_segments_for_candidate(field, &records.array_path))
        .collect::<Vec<_>>();
    let mut request_combination_count = 0usize;

    for (record_index, record) in &records.records {
        let per_field_matches = field_segments
            .iter()
            .map(|segments| collect_record_pattern_matches(record, segments))
            .collect::<Vec<_>>();

        if per_field_matches.iter().any(Vec::is_empty) {
            continue;
        }

        let combination_count = combination_count_for_matches(&per_field_matches);
        if combination_count > per_record_limit {
            return Err(DuplicateCombinationLimitError {
                scope: DuplicateCombinationLimitScope::Record {
                    record_index: *record_index,
                },
                combination_count,
                limit: per_record_limit,
            });
        }

        request_combination_count = request_combination_count.saturating_add(combination_count);
        if request_combination_count > request_limit {
            return Err(DuplicateCombinationLimitError {
                scope: DuplicateCombinationLimitScope::Request,
                combination_count: request_combination_count,
                limit: request_limit,
            });
        }
    }

    Ok(())
}

/// Find source-parity single-field duplicate values from the best object-array candidate.
///
/// This advanced workflow keeps the legacy [`analyze_field_duplicates`] output untouched while
/// adding all-values summaries, parent record metadata, optional filtering, duplicate-key-aware
/// source paths, and 1-based pagination over duplicate groups.
#[must_use]
pub fn analyze_advanced_field_duplicates(
    value: &JsonValue,
    field_path: &str,
    filter: Option<&DuplicateFilter>,
    case_sensitive: bool,
    include_parent_items: bool,
    page: usize,
    page_size: usize,
) -> AdvancedFieldDuplicatesResponse {
    let Some(records) = candidate_records(value) else {
        return AdvancedFieldDuplicatesResponse {
            field_path: field_path.to_string(),
            total_items_considered: 0,
            duplicate_group_count: 0,
            page,
            page_size,
            has_next_page: false,
            duplicates: Vec::new(),
            all_values_summary: Vec::new(),
        };
    };

    let field_segments = pattern_segments_for_candidate(field_path, &records.array_path);
    let filter_segments = filter
        .map(|filter| pattern_segments_for_candidate(&filter.field_path, &records.array_path));

    let mut groups: Vec<AdvancedFieldGroupAccumulator> = Vec::new();
    for (record_index, record) in &records.records {
        if let Some(filter) = filter
            && !record_matches_filter(
                record,
                filter,
                filter_segments.as_deref().unwrap_or(&[]),
                case_sensitive,
            )
        {
            continue;
        }

        for matched in collect_record_pattern_matches(record, &field_segments) {
            if matches!(matched.value, JsonValue::Null) {
                continue;
            }

            let identity = normalized_identity(matched.value, case_sensitive);
            let output_value = normalized_json_value(matched.value, case_sensitive);
            let display_value = safe_str(matched.value);
            let source_path = record_source_path(*record_index, &matched.source_path);
            let parent_item = if include_parent_items {
                Some(parent_item_for_record(
                    *record_index,
                    record,
                    advanced_parent_summary_fields(&[field_path.to_string()], filter),
                    &records.array_path,
                ))
            } else {
                None
            };

            if let Some(existing) = groups.iter_mut().find(|group| group.identity == identity) {
                existing.count += 1;
                existing.source_paths.push(source_path);
                existing.add_record_index(*record_index);
                if let Some(parent_item) = parent_item {
                    existing.add_parent_item(parent_item);
                }
            } else {
                let mut group = AdvancedFieldGroupAccumulator {
                    identity,
                    value: output_value,
                    display_value,
                    count: 1,
                    first_source_path: source_path.clone(),
                    record_indexes: vec![*record_index],
                    source_paths: vec![source_path],
                    parent_items: Vec::new(),
                };
                if let Some(parent_item) = parent_item {
                    group.parent_items.push(parent_item);
                }
                groups.push(group);
            }
        }
    }

    sort_advanced_field_groups(&mut groups);
    let total_items_considered = groups.iter().map(|group| group.count).sum();
    let all_values_summary = groups
        .iter()
        .map(|group| DuplicateValueSummary {
            value: group.value.clone(),
            display_value: group.display_value.clone(),
            count: group.count,
            is_duplicate: group.count > 1,
        })
        .collect::<Vec<_>>();

    let duplicate_groups = groups
        .into_iter()
        .filter(|group| group.count > 1)
        .collect::<Vec<_>>();
    let duplicate_group_count = duplicate_groups.len();
    let (paged_duplicates, has_next_page) = paginate(duplicate_groups, page, page_size);

    AdvancedFieldDuplicatesResponse {
        field_path: field_path.to_string(),
        total_items_considered,
        duplicate_group_count,
        page,
        page_size,
        has_next_page,
        duplicates: paged_duplicates
            .into_iter()
            .map(AdvancedFieldGroupAccumulator::into_group)
            .collect(),
        all_values_summary,
    }
}

/// Find composite duplicate groups for 2-5 field paths from the best object-array candidate.
///
/// Records with any missing selected field are excluded. Duplicate keys and array-valued field
/// matches are treated as separate observations and combined deterministically, matching Values
/// Explorer's duplicate-preserving AST behavior.
#[must_use]
pub fn analyze_composite_duplicates(
    value: &JsonValue,
    field_paths: &[String],
    filter: Option<&DuplicateFilter>,
    case_sensitive: bool,
    include_parent_items: bool,
    page: usize,
    page_size: usize,
) -> CompositeDuplicatesResponse {
    let Some(records) = candidate_records(value) else {
        return CompositeDuplicatesResponse {
            field_paths: field_paths.to_vec(),
            duplicate_group_count: 0,
            page,
            page_size,
            has_next_page: false,
            duplicates: Vec::new(),
        };
    };

    let field_segments = field_paths
        .iter()
        .map(|field| pattern_segments_for_candidate(field, &records.array_path))
        .collect::<Vec<_>>();
    let filter_segments = filter
        .map(|filter| pattern_segments_for_candidate(&filter.field_path, &records.array_path));
    let mut groups: Vec<CompositeGroupAccumulator> = Vec::new();

    for (record_index, record) in &records.records {
        if let Some(filter) = filter
            && !record_matches_filter(
                record,
                filter,
                filter_segments.as_deref().unwrap_or(&[]),
                case_sensitive,
            )
        {
            continue;
        }

        let per_field_matches = field_segments
            .iter()
            .map(|segments| collect_record_pattern_matches(record, segments))
            .collect::<Vec<_>>();

        if per_field_matches.iter().any(Vec::is_empty) {
            continue;
        }

        for combination in match_combinations(&per_field_matches) {
            let identity = combination
                .iter()
                .map(|matched| normalized_identity(matched.value, case_sensitive))
                .collect::<Vec<_>>();
            let key = combination
                .iter()
                .map(|matched| normalized_json_value(matched.value, case_sensitive))
                .collect::<Vec<_>>();
            let source_paths = combination
                .iter()
                .map(|matched| record_source_path(*record_index, &matched.source_path))
                .collect::<Vec<_>>();
            let first_source_path = source_paths.first().cloned().unwrap_or_default();
            let parent_item = if include_parent_items {
                Some(parent_item_for_record(
                    *record_index,
                    record,
                    advanced_parent_summary_fields(field_paths, filter),
                    &records.array_path,
                ))
            } else {
                None
            };

            if let Some(existing) = groups.iter_mut().find(|group| group.identity == identity) {
                existing.count += 1;
                existing.source_paths.extend(source_paths);
                existing.add_record_index(*record_index);
                if let Some(parent_item) = parent_item {
                    existing.add_parent_item(parent_item);
                }
            } else {
                let mut group = CompositeGroupAccumulator {
                    identity,
                    key,
                    display_value: combination
                        .iter()
                        .map(|matched| safe_str(matched.value))
                        .collect::<Vec<_>>()
                        .join(" | "),
                    count: 1,
                    first_source_path,
                    record_indexes: vec![*record_index],
                    source_paths,
                    parent_items: Vec::new(),
                };
                if let Some(parent_item) = parent_item {
                    group.parent_items.push(parent_item);
                }
                groups.push(group);
            }
        }
    }

    let mut duplicate_groups = groups
        .into_iter()
        .filter(|group| group.count > 1)
        .collect::<Vec<_>>();
    sort_composite_groups(&mut duplicate_groups);

    let duplicate_group_count = duplicate_groups.len();
    let (paged_duplicates, has_next_page) = paginate(duplicate_groups, page, page_size);

    CompositeDuplicatesResponse {
        field_paths: field_paths.to_vec(),
        duplicate_group_count,
        page,
        page_size,
        has_next_page,
        duplicates: paged_duplicates
            .into_iter()
            .map(CompositeGroupAccumulator::into_group)
            .collect(),
    }
}

/// Find exact duplicate items in the best candidate array.
///
/// Candidate arrays are scored by source-compatible heuristics: arrays of
/// objects, paths containing `data`, arrays with at least five items, then size.
/// Empty objects, empty arrays, nulls, and blank strings are skipped as
/// non-meaningful. Group keys use target compact AST serialization, so object
/// member order and duplicate keys are preserved.
#[must_use]
pub fn analyze_exact_duplicates(value: &JsonValue) -> ExactDuplicatesResult {
    let Some(candidate) = best_array_candidate(value, CandidateMode::ExactDuplicates) else {
        return ExactDuplicatesResult::empty("No suitable array found");
    };

    let mut groups: Vec<(String, Vec<usize>)> = Vec::new();
    for (index, item) in candidate.items.iter().enumerate() {
        if !is_meaningful_duplicate_item(item) {
            continue;
        }
        let key = item.compact_json();
        if let Some((_, indexes)) = groups.iter_mut().find(|(existing, _)| existing == &key) {
            indexes.push(index);
        } else {
            groups.push((key, vec![index]));
        }
    }

    let total_items: usize = groups.iter().map(|(_, indexes)| indexes.len()).sum();
    let unique_items = groups.len();
    let duplicates = groups
        .into_iter()
        .filter(|(_, indexes)| indexes.len() > 1)
        .map(|(value, indexes)| ExactDuplicateGroup { value, indexes })
        .collect::<Vec<_>>();
    let duplicate_groups = duplicates.len();

    ExactDuplicatesResult {
        total_items,
        unique_items,
        duplicate_groups,
        has_duplicates: duplicate_groups > 0,
        duplicates,
        analysis_path: format_analysis_path(&candidate.path, candidate.items.len()),
    }
}

/// Find duplicate values for a normalized field pattern such as `[].email`.
///
/// Missing fields do not produce flattened matches. JSON null matches are
/// skipped. Case-insensitive mode lowercases only the comparison/output key;
/// it does not mutate source paths or original AST values.
#[must_use]
pub fn analyze_field_duplicates(
    value: &JsonValue,
    field_path: &str,
    case_sensitive: bool,
) -> FieldDuplicatesResult {
    let mut groups: Vec<FieldDuplicateGroup> = Vec::new();
    let matches = collect_pattern_matches(value, field_path);
    for matched in matches {
        if matches!(matched.value, JsonValue::Null) {
            continue;
        }

        let mut key = safe_str(matched.value);
        if !case_sensitive {
            key = key.to_lowercase();
        }

        if let Some(existing) = groups.iter_mut().find(|group| group.value == key) {
            existing.count += 1;
            existing.source_paths.push(matched.path);
        } else {
            groups.push(FieldDuplicateGroup {
                value: key,
                count: 1,
                source_paths: vec![matched.path],
            });
        }
    }

    let total_items = groups.iter().map(|group| group.count).sum();
    let unique_values = groups.len();
    let duplicates = groups
        .iter()
        .filter(|group| group.count > 1)
        .cloned()
        .collect::<Vec<_>>();
    let all_values_summary = groups
        .iter()
        .map(|group| FieldDuplicateSummary {
            value: group.value.clone(),
            count: group.count,
            is_duplicate: group.count > 1,
        })
        .collect::<Vec<_>>();
    let duplicate_count = duplicates.len();

    FieldDuplicatesResult {
        field_path: field_path.to_string(),
        total_items,
        unique_values,
        duplicate_count,
        has_duplicates: duplicate_count > 0,
        duplicates,
        all_values_summary,
    }
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum CandidateMode {
    ExactDuplicates,
    Records,
}

pub(crate) struct ArrayCandidate<'a> {
    pub path: String,
    pub items: &'a [JsonValue],
    score: usize,
    order: usize,
}

pub(crate) fn best_array_candidate(
    value: &JsonValue,
    mode: CandidateMode,
) -> Option<ArrayCandidate<'_>> {
    let mut candidates = Vec::new();
    collect_array_candidates(value, String::new(), &mut candidates, &mut 0, mode);
    candidates
        .into_iter()
        .filter(|candidate| match mode {
            CandidateMode::ExactDuplicates => candidate.items.len() > 1,
            CandidateMode::Records => {
                candidate.items.len() > 1
                    && candidate
                        .items
                        .iter()
                        .any(|item| matches!(item, JsonValue::Object(_)))
            }
        })
        .max_by(|left, right| {
            left.score
                .cmp(&right.score)
                .then_with(|| right.order.cmp(&left.order))
        })
}

fn collect_array_candidates<'a>(
    value: &'a JsonValue,
    path: String,
    candidates: &mut Vec<ArrayCandidate<'a>>,
    order: &mut usize,
    mode: CandidateMode,
) {
    match value {
        JsonValue::Array(items) => {
            let current_order = *order;
            *order += 1;
            candidates.push(ArrayCandidate {
                score: candidate_score(&path, items, mode),
                path: path.clone(),
                items,
                order: current_order,
            });
            for (index, item) in items.iter().enumerate() {
                collect_array_candidates(
                    item,
                    append_path(&path, &index.to_string()),
                    candidates,
                    order,
                    mode,
                );
            }
        }
        JsonValue::Object(members) => {
            for (key, member) in members {
                collect_array_candidates(member, append_path(&path, key), candidates, order, mode);
            }
        }
        JsonValue::Null | JsonValue::Bool(_) | JsonValue::Number(_) | JsonValue::String(_) => {}
    }
}

fn candidate_score(path: &str, items: &[JsonValue], mode: CandidateMode) -> usize {
    let object_items = items
        .iter()
        .filter(|item| matches!(item, JsonValue::Object(_)))
        .count();
    let data_path_bonus = usize::from(path.to_lowercase().contains("data"));
    let large_array_bonus = usize::from(items.len() >= 5);

    match mode {
        CandidateMode::ExactDuplicates => {
            object_items * 1_000_000
                + data_path_bonus * 100_000
                + large_array_bonus * 10_000
                + items.len()
        }
        CandidateMode::Records => {
            object_items * 1_000_000
                + data_path_bonus * 100_000
                + large_array_bonus * 10_000
                + items.len()
        }
    }
}

fn is_meaningful_duplicate_item(value: &JsonValue) -> bool {
    match value {
        JsonValue::Null => false,
        JsonValue::String(value) => !value.trim().is_empty(),
        JsonValue::Array(values) => !values.is_empty(),
        JsonValue::Object(members) => !members.is_empty(),
        JsonValue::Bool(_) | JsonValue::Number(_) => true,
    }
}

pub(crate) fn format_analysis_path(path: &str, len: usize) -> String {
    if path.is_empty() {
        "root".to_string()
    } else {
        format!("{path} ({len} items)")
    }
}

struct PatternMatch<'a> {
    path: String,
    value: &'a JsonValue,
}

fn collect_pattern_matches<'a>(value: &'a JsonValue, pattern: &str) -> Vec<PatternMatch<'a>> {
    let segments = if pattern.is_empty() {
        Vec::new()
    } else {
        pattern.split('.').collect::<Vec<_>>()
    };
    let mut matches = Vec::new();
    collect_pattern_matches_into(value, &segments, String::new(), &mut matches);
    matches
}

fn collect_pattern_matches_into<'a>(
    value: &'a JsonValue,
    remaining_segments: &[&str],
    path: String,
    matches: &mut Vec<PatternMatch<'a>>,
) {
    let Some((segment, rest)) = remaining_segments.split_first() else {
        matches.push(PatternMatch { path, value });
        return;
    };

    match (value, *segment) {
        (JsonValue::Array(values), "[]") => {
            for (index, item) in values.iter().enumerate() {
                collect_pattern_matches_into(
                    item,
                    rest,
                    append_path(&path, &index.to_string()),
                    matches,
                );
            }
        }
        (JsonValue::Object(members), key) => {
            for (member_key, member_value) in members {
                if member_key == key {
                    collect_pattern_matches_into(
                        member_value,
                        rest,
                        append_path(&path, key),
                        matches,
                    );
                }
            }
        }
        _ => {}
    }
}

fn append_path(base: &str, segment: &str) -> String {
    if base.is_empty() {
        segment.to_string()
    } else {
        format!("{base}.{segment}")
    }
}

#[derive(Debug, Clone)]
struct LeafMatch<'a> {
    source_path: String,
    value: &'a JsonValue,
}

#[derive(Debug, Clone)]
struct AdvancedFieldGroupAccumulator {
    identity: String,
    value: Json,
    display_value: String,
    count: usize,
    first_source_path: String,
    record_indexes: Vec<usize>,
    source_paths: Vec<String>,
    parent_items: Vec<ParentItem>,
}

impl AdvancedFieldGroupAccumulator {
    fn add_record_index(&mut self, record_index: usize) {
        if !self.record_indexes.contains(&record_index) {
            self.record_indexes.push(record_index);
        }
    }

    fn add_parent_item(&mut self, parent_item: ParentItem) {
        if !self
            .parent_items
            .iter()
            .any(|item| item.record_index == parent_item.record_index)
        {
            self.parent_items.push(parent_item);
        }
    }

    fn into_group(self) -> AdvancedFieldDuplicateGroup {
        AdvancedFieldDuplicateGroup {
            value: self.value,
            display_value: self.display_value,
            count: self.count,
            record_indexes: self.record_indexes,
            source_paths: self.source_paths,
            parent_items: self.parent_items,
        }
    }
}

#[derive(Debug, Clone)]
struct CompositeGroupAccumulator {
    identity: Vec<String>,
    key: Vec<Json>,
    display_value: String,
    count: usize,
    first_source_path: String,
    record_indexes: Vec<usize>,
    source_paths: Vec<String>,
    parent_items: Vec<ParentItem>,
}

impl CompositeGroupAccumulator {
    fn add_record_index(&mut self, record_index: usize) {
        if !self.record_indexes.contains(&record_index) {
            self.record_indexes.push(record_index);
        }
    }

    fn add_parent_item(&mut self, parent_item: ParentItem) {
        if !self
            .parent_items
            .iter()
            .any(|item| item.record_index == parent_item.record_index)
        {
            self.parent_items.push(parent_item);
        }
    }

    fn into_group(self) -> CompositeDuplicateGroup {
        CompositeDuplicateGroup {
            key: self.key,
            count: self.count,
            record_indexes: self.record_indexes,
            source_paths: self.source_paths,
            parent_items: self.parent_items,
        }
    }
}

struct RecordsCandidate<'a> {
    array_path: String,
    records: Vec<(usize, &'a JsonValue)>,
}

fn candidate_records(value: &JsonValue) -> Option<RecordsCandidate<'_>> {
    let candidate = best_array_candidate(value, CandidateMode::Records)?;
    let records = candidate
        .items
        .iter()
        .enumerate()
        .filter_map(|(index, item)| match item {
            JsonValue::Object(_) => Some((index, item)),
            _ => None,
        })
        .collect::<Vec<_>>();

    if records.is_empty() {
        None
    } else {
        Some(RecordsCandidate {
            array_path: candidate.path,
            records,
        })
    }
}

fn pattern_segments_for_candidate(field_path: &str, array_path: &str) -> Vec<String> {
    let trimmed = field_path.trim();
    let candidate_pattern = path_to_pattern(array_path);
    let relative = if !array_path.is_empty() && trimmed == array_path {
        ""
    } else if !array_path.is_empty() && trimmed.starts_with(&format!("{array_path}.")) {
        &trimmed[array_path.len() + 1..]
    } else if !candidate_pattern.is_empty() && trimmed == candidate_pattern {
        ""
    } else if !candidate_pattern.is_empty() && trimmed.starts_with(&format!("{candidate_pattern}."))
    {
        &trimmed[candidate_pattern.len() + 1..]
    } else {
        trimmed
    };

    relative
        .split('.')
        .filter(|segment| !segment.is_empty())
        .skip_while(|segment| *segment == "[]")
        .map(ToString::to_string)
        .collect()
}

fn collect_record_pattern_matches<'a>(
    record: &'a JsonValue,
    segments: &[String],
) -> Vec<LeafMatch<'a>> {
    let segment_refs = segments.iter().map(String::as_str).collect::<Vec<_>>();
    let mut matches = Vec::new();
    collect_record_pattern_matches_into(record, &segment_refs, String::new(), &mut matches);
    matches
}

fn collect_record_pattern_matches_into<'a>(
    value: &'a JsonValue,
    remaining_segments: &[&str],
    source_path: String,
    matches: &mut Vec<LeafMatch<'a>>,
) {
    let Some((segment, rest)) = remaining_segments.split_first() else {
        matches.push(LeafMatch { source_path, value });
        return;
    };

    match (value, *segment) {
        (JsonValue::Array(values), "[]") => {
            for (index, item) in values.iter().enumerate() {
                collect_record_pattern_matches_into(
                    item,
                    rest,
                    append_path(&source_path, &index.to_string()),
                    matches,
                );
            }
        }
        (JsonValue::Object(members), key) => {
            let duplicate_counts = duplicate_member_counts(members);
            let mut seen_counts = BTreeMap::new();
            for (member_key, member_value) in members {
                let occurrence = next_occurrence(&mut seen_counts, member_key);
                if member_key == key {
                    let source_segment =
                        source_member_segment(member_key, occurrence, &duplicate_counts);
                    collect_record_pattern_matches_into(
                        member_value,
                        rest,
                        append_path(&source_path, &source_segment),
                        matches,
                    );
                }
            }
        }
        _ => {}
    }
}

fn combination_count_for_matches(matches_by_field: &[Vec<LeafMatch<'_>>]) -> usize {
    matches_by_field
        .iter()
        .fold(1usize, |total, matches| total.saturating_mul(matches.len()))
}

fn match_combinations<'a>(
    matches_by_field: &'a [Vec<LeafMatch<'a>>],
) -> Vec<Vec<&'a LeafMatch<'a>>> {
    let mut combinations = Vec::new();
    let mut current = Vec::new();
    build_match_combinations(matches_by_field, 0, &mut current, &mut combinations);
    combinations
}

fn build_match_combinations<'a>(
    matches_by_field: &'a [Vec<LeafMatch<'a>>],
    index: usize,
    current: &mut Vec<&'a LeafMatch<'a>>,
    combinations: &mut Vec<Vec<&'a LeafMatch<'a>>>,
) {
    if index == matches_by_field.len() {
        combinations.push(current.clone());
        return;
    }

    for matched in &matches_by_field[index] {
        current.push(matched);
        build_match_combinations(matches_by_field, index + 1, current, combinations);
        current.pop();
    }
}

fn record_matches_filter(
    record: &JsonValue,
    filter: &DuplicateFilter,
    filter_segments: &[String],
    case_sensitive: bool,
) -> bool {
    collect_record_pattern_matches(record, filter_segments)
        .iter()
        .any(|matched| json_values_match_filter(matched.value, &filter.value, case_sensitive))
}

fn json_values_match_filter(value: &JsonValue, filter: &Json, case_sensitive: bool) -> bool {
    let value_json = value_to_json_value(value);
    if case_sensitive {
        value_json == *filter
    } else {
        json_match_identity(&value_json, false) == json_match_identity(filter, false)
    }
}

fn normalized_identity(value: &JsonValue, case_sensitive: bool) -> String {
    match value {
        JsonValue::Null => "null:null".to_string(),
        JsonValue::Bool(value) => format!("bool:{value}"),
        JsonValue::Number(number) => format!("number:{}", number.canonical_decimal()),
        JsonValue::String(value) if case_sensitive => format!("string:{value}"),
        JsonValue::String(value) => format!("string:{}", value.to_lowercase()),
        JsonValue::Array(_) if case_sensitive => format!("array:{}", value.compact_json()),
        JsonValue::Array(_) => format!("array:{}", value.compact_json().to_lowercase()),
        JsonValue::Object(_) if case_sensitive => format!("object:{}", value.compact_json()),
        JsonValue::Object(_) => format!("object:{}", value.compact_json().to_lowercase()),
    }
}

fn json_match_identity(value: &Json, case_sensitive: bool) -> String {
    match value {
        Json::Null => "null:null".to_string(),
        Json::Bool(value) => format!("bool:{value}"),
        Json::Number(value) => format!("number:{value}"),
        Json::String(value) if case_sensitive => format!("string:{value}"),
        Json::String(value) => format!("string:{}", value.to_lowercase()),
        Json::Array(_) if case_sensitive => format!("array:{value}"),
        Json::Array(_) => format!("array:{}", value.to_string().to_lowercase()),
        Json::Object(_) if case_sensitive => format!("object:{value}"),
        Json::Object(_) => format!("object:{}", value.to_string().to_lowercase()),
    }
}

fn normalized_json_value(value: &JsonValue, case_sensitive: bool) -> Json {
    match value {
        JsonValue::String(value) if !case_sensitive => Json::String(value.to_lowercase()),
        _ => value_to_json_value(value),
    }
}

fn value_to_json_value(value: &JsonValue) -> Json {
    match value {
        JsonValue::Null => Json::Null,
        JsonValue::Bool(value) => Json::Bool(*value),
        JsonValue::Number(number) => serde_json::from_str(&number.canonical_decimal())
            .unwrap_or_else(|_| Json::String(number.canonical_decimal())),
        JsonValue::String(value) => Json::String(value.clone()),
        JsonValue::Array(_) | JsonValue::Object(_) => Json::String(value.compact_json()),
    }
}

fn advanced_parent_summary_fields(
    selected_fields: &[String],
    filter: Option<&DuplicateFilter>,
) -> Vec<String> {
    let mut fields = Vec::new();
    if let Some(filter) = filter {
        fields.push(filter.field_path.clone());
    } else {
        fields.extend(selected_fields.iter().cloned());
    }
    fields
}

fn parent_item_for_record(
    record_index: usize,
    record: &JsonValue,
    summary_fields: Vec<String>,
    array_path: &str,
) -> ParentItem {
    let mut summary = BTreeMap::new();

    if let JsonValue::Object(members) = record {
        insert_top_level_member(members, "id", &mut summary);
        insert_top_level_member(members, "name", &mut summary);

        for field_path in summary_fields {
            if let Some(first_segment) =
                pattern_segments_for_candidate(&field_path, array_path).first()
            {
                insert_top_level_member(members, first_segment, &mut summary);
            }
        }
    }

    ParentItem {
        record_index,
        source_path: Some(record_index.to_string()),
        summary,
    }
}

fn insert_top_level_member(
    members: &[(String, JsonValue)],
    key: &str,
    summary: &mut BTreeMap<String, Json>,
) {
    if summary.contains_key(key) {
        return;
    }

    if let Some((_, value)) = members.iter().find(|(member_key, _)| member_key == key)
        && is_summary_value(value)
    {
        summary.insert(key.to_string(), value_to_json_value(value));
    }
}

fn is_summary_value(value: &JsonValue) -> bool {
    matches!(
        value,
        JsonValue::Null | JsonValue::Bool(_) | JsonValue::Number(_) | JsonValue::String(_)
    )
}

fn record_source_path(record_index: usize, relative_path: &str) -> String {
    if relative_path.is_empty() {
        record_index.to_string()
    } else {
        format!("{record_index}.{relative_path}")
    }
}

fn sort_advanced_field_groups(groups: &mut [AdvancedFieldGroupAccumulator]) {
    groups.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.display_value.cmp(&right.display_value))
            .then_with(|| left.first_source_path.cmp(&right.first_source_path))
    });
}

fn sort_composite_groups(groups: &mut [CompositeGroupAccumulator]) {
    groups.sort_by(|left, right| {
        right
            .count
            .cmp(&left.count)
            .then_with(|| left.display_value.cmp(&right.display_value))
            .then_with(|| left.first_source_path.cmp(&right.first_source_path))
    });
}

fn paginate<T>(items: Vec<T>, page: usize, page_size: usize) -> (Vec<T>, bool) {
    let total_items = items.len();
    let start = page.saturating_sub(1).saturating_mul(page_size);
    let end = start.saturating_add(page_size).min(total_items);
    let has_next_page = end < total_items;
    if start >= total_items {
        return (Vec::new(), false);
    }

    let mut page_items = items;
    let tail = page_items.split_off(end);
    drop(tail);
    let page_items = page_items.split_off(start);
    (page_items, has_next_page)
}

fn duplicate_member_counts(members: &[(String, JsonValue)]) -> BTreeMap<&str, usize> {
    let mut counts = BTreeMap::new();
    for (key, _) in members {
        *counts.entry(key.as_str()).or_insert(0) += 1;
    }
    counts
}

fn next_occurrence(seen_counts: &mut BTreeMap<String, usize>, key: &str) -> usize {
    let occurrence = seen_counts.entry(key.to_string()).or_insert(0);
    *occurrence += 1;
    *occurrence
}

fn source_member_segment(
    key: &str,
    occurrence: usize,
    duplicate_counts: &BTreeMap<&str, usize>,
) -> String {
    if duplicate_counts.get(key).copied().unwrap_or(0) > 1 {
        format!("{key}#{occurrence}")
    } else {
        key.to_string()
    }
}

impl ExactDuplicatesResult {
    fn empty(analysis_path: &str) -> Self {
        Self {
            total_items: 0,
            unique_items: 0,
            duplicate_groups: 0,
            duplicates: Vec::new(),
            has_duplicates: false,
            analysis_path: analysis_path.to_string(),
        }
    }
}
