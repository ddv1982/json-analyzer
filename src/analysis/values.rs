use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet};

use serde_json::Value as Json;

use crate::ast::JsonValue;
use crate::dto::{
    ParentItem, SortDirection, ValuesAnalysisResponse, ValuesExplorerAnalysisResponse,
    ValuesExplorerFilter, ValuesExplorerFilterMatchMode, ValuesExplorerGroup, ValuesExplorerItem,
    ValuesExplorerSortMode, ValuesFieldDiscoveryResponse, ValuesFieldInfo, ValuesGroup, ValuesSort,
    ValuesSortBy,
};
use crate::fields::label_for_pattern;
use crate::json_ops::{path_to_pattern, safe_str};

use super::duplicates::{CandidateMode, best_array_candidate};
use super::structure::json_type_name;

/// Guardrail for Values Explorer multi-field matching. The analyzer groups all
/// value observations per selected field within a source record; array fields
/// and duplicate object members can otherwise form an unbounded Cartesian
/// product before search/sort/pagination are applied.
pub const VALUES_MAX_MATCH_COMBINATIONS_PER_RECORD: usize = 10_000;
pub const VALUES_MAX_MATCH_COMBINATIONS_PER_REQUEST: usize = 100_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValuesCombinationLimitScope {
    Record { record_index: usize },
    Request,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ValuesCombinationLimitError {
    pub scope: ValuesCombinationLimitScope,
    pub combination_count: usize,
    pub limit: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValuesCompositeAmbiguityError {
    pub record_index: usize,
    pub field_path: String,
    pub match_count: usize,
}

/// Discover Values Explorer fields from the best object-array candidate.
///
/// Field paths are normalized relative to the selected record array, so a root
/// array record field is reported as `[].field` and nested array values as
/// `[].items.[]`. Missing counts are computed per object record; duplicate keys
/// and repeated array values are counted in encounter order.
#[must_use]
pub fn discover_values_fields(
    value: &JsonValue,
    search: Option<&str>,
    limit: Option<usize>,
) -> ValuesFieldDiscoveryResponse {
    let Some(records) = candidate_records(value) else {
        return ValuesFieldDiscoveryResponse { fields: Vec::new() };
    };

    let mut fields: Vec<FieldAccumulator> = Vec::new();
    for (record_index, record) in &records {
        let matches = collect_record_leaf_matches(record);
        for matched in matches {
            let field_path = record_pattern(&matched.path);
            let Some(existing) = fields
                .iter_mut()
                .find(|field| field.field_path == field_path)
            else {
                let mut accumulator = FieldAccumulator::new(field_path);
                accumulator.observe(*record_index, matched.value);
                fields.push(accumulator);
                continue;
            };
            existing.observe(*record_index, matched.value);
        }
    }

    let record_count = records.len();
    let search = normalize_search(search);
    let mut fields = fields
        .into_iter()
        .map(|field| field.into_info(record_count))
        .filter(|field| match &search {
            Some(search) => {
                field.field_path.to_lowercase().contains(search)
                    || field.label.to_lowercase().contains(search)
            }
            None => true,
        })
        .collect::<Vec<_>>();

    if let Some(limit) = limit {
        fields.truncate(limit);
    }

    ValuesFieldDiscoveryResponse { fields }
}

/// Validate that selected fields will not produce too many match combinations
/// for any single source record or request.
pub fn validate_values_combination_limits(
    value: &JsonValue,
    selected_fields: &[String],
    per_record_limit: usize,
    request_limit: usize,
) -> Result<(), ValuesCombinationLimitError> {
    let Some(records) = candidate_records(value) else {
        return Ok(());
    };

    let field_segments = selected_fields
        .iter()
        .map(|field| pattern_segments_for_record(field))
        .collect::<Vec<_>>();
    let mut request_combination_count = 0usize;

    for (record_index, record) in &records {
        let per_field_matches = field_segments
            .iter()
            .map(|segments| collect_record_pattern_matches(record, segments))
            .collect::<Vec<_>>();

        if per_field_matches.iter().any(Vec::is_empty) {
            continue;
        }

        let combination_count = combination_count_for_matches(&per_field_matches);
        if combination_count > per_record_limit {
            return Err(ValuesCombinationLimitError {
                scope: ValuesCombinationLimitScope::Record {
                    record_index: *record_index,
                },
                combination_count,
                limit: per_record_limit,
            });
        }

        request_combination_count = request_combination_count.saturating_add(combination_count);
        if request_combination_count > request_limit {
            return Err(ValuesCombinationLimitError {
                scope: ValuesCombinationLimitScope::Request,
                combination_count: request_combination_count,
                limit: request_limit,
            });
        }
    }

    Ok(())
}

/// Validate target-style composite matching.
///
/// The target Values Explorer treats each selected field as a single scoped
/// value per record. If a field resolves to multiple values inside the same
/// record scope, composite matching is ambiguous and should fail instead of
/// expanding a Cartesian product.
pub fn validate_values_explorer_composite_unambiguous(
    value: &JsonValue,
    selected_fields: &[String],
) -> Result<(), ValuesCompositeAmbiguityError> {
    if selected_fields.len() <= 1 {
        return Ok(());
    }

    let Some(records) = candidate_records(value) else {
        return Ok(());
    };

    let field_segments = selected_fields
        .iter()
        .map(|field| (field, pattern_segments_for_record(field)))
        .collect::<Vec<_>>();

    for (record_index, record) in &records {
        for (field_path, segments) in &field_segments {
            let match_count = collect_record_pattern_matches(record, segments).len();
            if match_count > 1 {
                return Err(ValuesCompositeAmbiguityError {
                    record_index: *record_index,
                    field_path: (*field_path).clone(),
                    match_count,
                });
            }
        }
    }

    Ok(())
}

/// Analyze selected Values Explorer fields from the best object-array candidate.
///
/// Missing fields are excluded by default: if any selected field has no match in
/// a record, that record contributes no value group. JSON nulls are included as
/// the native `null` key/display value. Duplicate keys and repeated array
/// element matches produce multiple observations while parent item summaries are
/// reported once per source record in input order.
#[must_use]
pub fn analyze_values(
    value: &JsonValue,
    selected_fields: &[String],
    search: Option<&str>,
    sort: ValuesSort,
    page: usize,
    page_size: usize,
    include_parent_items: bool,
) -> ValuesAnalysisResponse {
    let Some(records) = candidate_records(value) else {
        return ValuesAnalysisResponse {
            selected_fields: selected_fields.to_vec(),
            total_groups: 0,
            page,
            page_size,
            has_next_page: false,
            groups: Vec::new(),
        };
    };

    let field_segments = selected_fields
        .iter()
        .map(|field| pattern_segments_for_record(field))
        .collect::<Vec<_>>();

    let mut groups: Vec<GroupAccumulator> = Vec::new();
    for (record_index, record) in &records {
        let per_field_matches = field_segments
            .iter()
            .map(|segments| collect_record_pattern_matches(record, segments))
            .collect::<Vec<_>>();

        if per_field_matches.iter().any(Vec::is_empty) {
            continue;
        }

        let combinations = match_combinations(&per_field_matches);
        for combination in combinations {
            let key_values = combination
                .iter()
                .map(|matched| value_to_json_key(matched.value))
                .collect::<Vec<_>>();
            let identity = combination
                .iter()
                .map(|matched| typed_identity(matched.value))
                .collect::<Vec<_>>();
            let display_parts = combination
                .iter()
                .map(|matched| safe_str(matched.value))
                .collect::<Vec<_>>();
            let source_paths = combination
                .iter()
                .map(|matched| record_source_path(*record_index, &matched.source_path))
                .collect::<Vec<_>>();

            let parent_item = if include_parent_items {
                Some(parent_item_for_record(
                    *record_index,
                    record,
                    selected_fields,
                    &field_segments,
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
                let mut group = GroupAccumulator {
                    identity,
                    key: key_values,
                    display_value: display_parts.join(" | "),
                    count: 1,
                    first_source_path: source_paths.first().cloned().unwrap_or_default(),
                    source_paths,
                    record_indexes: vec![*record_index],
                    parent_items: Vec::new(),
                };
                if let Some(parent_item) = parent_item {
                    group.parent_items.push(parent_item);
                }
                groups.push(group);
            }
        }
    }

    let search = normalize_search(search);
    let mut groups = groups
        .into_iter()
        .filter(|group| match &search {
            Some(search) => group.search_text().contains(search),
            None => true,
        })
        .collect::<Vec<_>>();

    sort_groups(&mut groups, sort);

    let total_groups = groups.len();
    let start = page.saturating_sub(1).saturating_mul(page_size);
    let end = start.saturating_add(page_size).min(total_groups);
    let has_next_page = end < total_groups;
    let page_groups = if start >= total_groups {
        Vec::new()
    } else {
        groups[start..end]
            .iter()
            .cloned()
            .map(GroupAccumulator::into_group)
            .collect()
    };

    ValuesAnalysisResponse {
        selected_fields: selected_fields.to_vec(),
        total_groups,
        page,
        page_size,
        has_next_page,
        groups: page_groups,
    }
}

/// Analyze fields with the target Values Explorer contract.
///
/// The response intentionally contains a duplicate-group page and an all-values
/// page from the same request so the UI can show target-style global summary
/// metrics without deriving duplicate counts from the visible all-results page.
#[derive(Debug, Clone, Copy)]
pub struct ValuesExplorerAnalysisOptions {
    pub sort_mode: ValuesExplorerSortMode,
    pub page: usize,
    pub groups_page: usize,
    pub page_size: usize,
    pub max_items_per_group: usize,
}

#[must_use]
pub fn analyze_values_explorer(
    value: &JsonValue,
    selected_fields: &[String],
    filter: Option<&ValuesExplorerFilter>,
    options: ValuesExplorerAnalysisOptions,
) -> ValuesExplorerAnalysisResponse {
    let Some(records) = candidate_records(value) else {
        return ValuesExplorerAnalysisResponse {
            field_path: selected_fields.join(" + "),
            field_paths: selected_fields.to_vec(),
            is_composite: selected_fields.len() > 1,
            total_items: 0,
            unique_values: 0,
            duplicate_group_count: 0,
            has_duplicates: false,
            duplicates: Vec::new(),
            all_field_values: Vec::new(),
            page: options.page,
            page_size: options.page_size,
            total_pages: 1,
            has_next_page: false,
            groups_page: options.groups_page,
            groups_total_pages: 1,
            sort_mode: options.sort_mode,
            filter: filter.cloned(),
        };
    };

    let field_segments = selected_fields
        .iter()
        .map(|field| pattern_segments_for_record(field))
        .collect::<Vec<_>>();
    let filter_segments = filter.map(|filter| pattern_segments_for_record(&filter.field_path));

    let mut groups: Vec<GroupAccumulator> = Vec::new();
    for (record_index, record) in &records {
        if let Some(filter) = filter
            && !record_matches_values_filter(
                record,
                filter,
                filter_segments.as_deref().unwrap_or(&[]),
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

        let combinations = match_combinations(&per_field_matches);
        for combination in combinations {
            let key_values = combination
                .iter()
                .map(|matched| value_to_json_key(matched.value))
                .collect::<Vec<_>>();
            let identity = combination
                .iter()
                .map(|matched| typed_identity(matched.value))
                .collect::<Vec<_>>();
            let display_parts = combination
                .iter()
                .map(|matched| safe_str(matched.value))
                .collect::<Vec<_>>();
            let source_paths = combination
                .iter()
                .map(|matched| record_source_path(*record_index, &matched.source_path))
                .collect::<Vec<_>>();

            if let Some(existing) = groups.iter_mut().find(|group| group.identity == identity) {
                existing.count += 1;
                existing.source_paths.extend(source_paths);
                existing.add_record_index(*record_index);
                if existing.should_collect_parent_item(*record_index, options.max_items_per_group) {
                    existing.add_parent_item(parent_item_for_record(
                        *record_index,
                        record,
                        selected_fields,
                        &field_segments,
                    ));
                }
            } else {
                groups.push(GroupAccumulator {
                    identity,
                    key: key_values,
                    display_value: display_parts.join(" | "),
                    count: 1,
                    first_source_path: source_paths.first().cloned().unwrap_or_default(),
                    source_paths,
                    record_indexes: vec![*record_index],
                    parent_items: if options.max_items_per_group > 0 {
                        vec![parent_item_for_record(
                            *record_index,
                            record,
                            selected_fields,
                            &field_segments,
                        )]
                    } else {
                        Vec::new()
                    },
                });
            }
        }
    }

    sort_groups(&mut groups, values_sort_for_mode(options.sort_mode));

    let total_items = groups.iter().map(|group| group.count).sum();
    let unique_values = groups.len();
    let duplicate_group_count = groups.iter().filter(|group| group.count > 1).count();
    let duplicate_total_pages = total_pages(duplicate_group_count, options.page_size);
    let groups_total_pages = total_pages(unique_values, options.page_size);
    let has_next_page = options.page < duplicate_total_pages;

    let duplicates = page_slice(
        groups.iter().filter(|group| group.count > 1),
        options.page,
        options.page_size,
    )
    .into_iter()
    .map(values_explorer_group_from_accumulator)
    .collect::<Vec<_>>();
    let all_field_values = page_slice(groups.iter(), options.groups_page, options.page_size)
        .into_iter()
        .map(values_explorer_group_from_accumulator)
        .collect::<Vec<_>>();

    ValuesExplorerAnalysisResponse {
        field_path: selected_fields.join(" + "),
        field_paths: selected_fields.to_vec(),
        is_composite: selected_fields.len() > 1,
        total_items,
        unique_values,
        duplicate_group_count,
        has_duplicates: duplicate_group_count > 0,
        duplicates,
        all_field_values,
        page: options.page,
        page_size: options.page_size,
        total_pages: duplicate_total_pages,
        has_next_page,
        groups_page: options.groups_page,
        groups_total_pages,
        sort_mode: options.sort_mode,
        filter: filter.cloned(),
    }
}

/// Enforce the configured parent/source item cap on each Values Explorer group.
///
/// The analyzer collects parent items in input order while deduplicating by
/// source record; the service applies its typed config cap before returning the
/// response to callers.
#[must_use]
pub fn cap_parent_items_per_group(
    mut response: ValuesAnalysisResponse,
    max_parent_items_per_group: usize,
) -> ValuesAnalysisResponse {
    for group in &mut response.groups {
        group.parent_items.truncate(max_parent_items_per_group);
    }
    response
}

/// Enforce the same preview-item cap on the target Values Explorer response.
#[must_use]
pub fn cap_values_explorer_items_per_group(
    mut response: ValuesExplorerAnalysisResponse,
    max_items_per_group: usize,
) -> ValuesExplorerAnalysisResponse {
    for group in &mut response.duplicates {
        group.items.truncate(max_items_per_group);
    }
    for group in &mut response.all_field_values {
        group.items.truncate(max_items_per_group);
    }
    response
}

#[derive(Debug, Clone)]
struct LeafMatch<'a> {
    path: String,
    source_path: String,
    value: &'a JsonValue,
}

#[derive(Debug, Clone)]
struct FieldAccumulator {
    field_path: String,
    type_hints: Vec<String>,
    non_null_count: usize,
    null_count: usize,
    matched_records: BTreeSet<usize>,
    unique_value_identities: Vec<String>,
    sample_values: Vec<Json>,
}

impl FieldAccumulator {
    fn new(field_path: String) -> Self {
        Self {
            field_path,
            type_hints: Vec::new(),
            non_null_count: 0,
            null_count: 0,
            matched_records: BTreeSet::new(),
            unique_value_identities: Vec::new(),
            sample_values: Vec::new(),
        }
    }

    fn observe(&mut self, record_index: usize, value: &JsonValue) {
        self.matched_records.insert(record_index);

        let type_name = json_type_name(value).to_string();
        if !self.type_hints.contains(&type_name) {
            self.type_hints.push(type_name);
        }

        if matches!(value, JsonValue::Null) {
            self.null_count += 1;
        } else {
            self.non_null_count += 1;
        }

        let identity = typed_identity(value);
        if !self.unique_value_identities.contains(&identity) {
            self.unique_value_identities.push(identity);
            if self.sample_values.len() < 5 && !matches!(value, JsonValue::Null) {
                self.sample_values.push(value_to_json_key(value));
            }
        }
    }

    fn into_info(self, record_count: usize) -> ValuesFieldInfo {
        let mut type_hints = self
            .type_hints
            .iter()
            .filter(|type_name| type_name.as_str() != "NoneType")
            .cloned()
            .collect::<Vec<_>>();
        if type_hints.is_empty() {
            type_hints = self.type_hints;
        }

        ValuesFieldInfo {
            label: label_for_pattern(&self.field_path),
            field_path: self.field_path,
            type_hints,
            non_null_count: self.non_null_count,
            null_count: self.null_count,
            missing_count: record_count.saturating_sub(self.matched_records.len()),
            unique_value_count: self.unique_value_identities.len(),
            sample_values: self.sample_values,
        }
    }
}

#[derive(Debug, Clone)]
struct GroupAccumulator {
    identity: Vec<String>,
    key: Vec<Json>,
    display_value: String,
    count: usize,
    first_source_path: String,
    source_paths: Vec<String>,
    record_indexes: Vec<usize>,
    parent_items: Vec<ParentItem>,
}

impl GroupAccumulator {
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

    fn should_collect_parent_item(&self, record_index: usize, max_items_per_group: usize) -> bool {
        max_items_per_group > 0
            && self.parent_items.len() < max_items_per_group
            && !self
                .parent_items
                .iter()
                .any(|item| item.record_index == record_index)
    }

    fn search_text(&self) -> String {
        let key_text = self
            .key
            .iter()
            .map(json_display_text)
            .collect::<Vec<_>>()
            .join(" ");
        format!("{} {}", self.display_value, key_text).to_lowercase()
    }

    fn into_group(self) -> ValuesGroup {
        ValuesGroup {
            key: self.key,
            display_value: self.display_value,
            count: self.count,
            source_paths: self.source_paths,
            record_indexes: self.record_indexes,
            parent_items: self.parent_items,
        }
    }
}

fn candidate_records(value: &JsonValue) -> Option<Vec<(usize, &JsonValue)>> {
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
        Some(records)
    }
}

fn collect_record_leaf_matches(record: &JsonValue) -> Vec<LeafMatch<'_>> {
    let mut matches = Vec::new();
    collect_leaf_matches_into(record, String::new(), String::new(), &mut matches);
    matches
}

fn collect_leaf_matches_into<'a>(
    value: &'a JsonValue,
    path: String,
    source_path: String,
    matches: &mut Vec<LeafMatch<'a>>,
) {
    match value {
        JsonValue::Array(values) => {
            for (index, item) in values.iter().enumerate() {
                let index = index.to_string();
                collect_leaf_matches_into(
                    item,
                    append_path(&path, &index),
                    append_path(&source_path, &index),
                    matches,
                );
            }
        }
        JsonValue::Object(members) => {
            let duplicate_counts = duplicate_member_counts(members);
            let mut seen_counts = BTreeMap::new();
            for (key, member) in members {
                let occurrence = next_occurrence(&mut seen_counts, key);
                let source_segment = source_member_segment(key, occurrence, &duplicate_counts);
                collect_leaf_matches_into(
                    member,
                    append_path(&path, key),
                    append_path(&source_path, &source_segment),
                    matches,
                );
            }
        }
        _ => matches.push(LeafMatch {
            path,
            source_path,
            value,
        }),
    }
}

fn collect_record_pattern_matches<'a>(
    record: &'a JsonValue,
    segments: &[String],
) -> Vec<LeafMatch<'a>> {
    let segment_refs = segments.iter().map(String::as_str).collect::<Vec<_>>();
    let mut matches = Vec::new();
    collect_pattern_matches_into(
        record,
        &segment_refs,
        String::new(),
        String::new(),
        &mut matches,
    );
    matches
}

fn collect_pattern_matches_into<'a>(
    value: &'a JsonValue,
    remaining_segments: &[&str],
    path: String,
    source_path: String,
    matches: &mut Vec<LeafMatch<'a>>,
) {
    let Some((segment, rest)) = remaining_segments.split_first() else {
        matches.push(LeafMatch {
            path,
            source_path,
            value,
        });
        return;
    };

    match (value, *segment) {
        (JsonValue::Array(values), "[]") => {
            for (index, item) in values.iter().enumerate() {
                let index = index.to_string();
                collect_pattern_matches_into(
                    item,
                    rest,
                    append_path(&path, &index),
                    append_path(&source_path, &index),
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
                    collect_pattern_matches_into(
                        member_value,
                        rest,
                        append_path(&path, key),
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

fn pattern_segments_for_record(field_path: &str) -> Vec<String> {
    field_path
        .split('.')
        .filter(|segment| !segment.is_empty())
        .skip_while(|segment| *segment == "[]")
        .map(ToString::to_string)
        .collect()
}

fn record_pattern(path: &str) -> String {
    let pattern = path_to_pattern(path);
    if pattern.is_empty() {
        "[]".to_string()
    } else {
        format!("[].{pattern}")
    }
}

fn record_source_path(record_index: usize, relative_path: &str) -> String {
    if relative_path.is_empty() {
        record_index.to_string()
    } else {
        format!("{record_index}.{relative_path}")
    }
}

fn parent_item_for_record(
    record_index: usize,
    record: &JsonValue,
    selected_fields: &[String],
    field_segments: &[Vec<String>],
) -> ParentItem {
    let mut summary = BTreeMap::new();

    if let JsonValue::Object(members) = record {
        insert_top_level_member(members, "id", &mut summary);
        insert_top_level_member(members, "name", &mut summary);

        for (field_path, segments) in selected_fields.iter().zip(field_segments) {
            if let Some(first_segment) = segments.first() {
                insert_top_level_member(members, first_segment, &mut summary);
            } else if !summary.contains_key(field_path) {
                summary.insert(field_path.clone(), value_to_json_key(record));
            }
        }

        for (key, value) in members {
            if summary.len() >= 3 {
                break;
            }
            if !summary.contains_key(key) && is_summary_value(value) {
                summary.insert(key.clone(), value_to_json_key(value));
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
        summary.insert(key.to_string(), value_to_json_key(value));
    }
}

fn is_summary_value(value: &JsonValue) -> bool {
    matches!(
        value,
        JsonValue::Null | JsonValue::Bool(_) | JsonValue::Number(_) | JsonValue::String(_)
    )
}

fn values_sort_for_mode(sort_mode: ValuesExplorerSortMode) -> ValuesSort {
    match sort_mode {
        ValuesExplorerSortMode::Frequency => ValuesSort {
            by: ValuesSortBy::Count,
            direction: SortDirection::Desc,
        },
        ValuesExplorerSortMode::Alphabetical => ValuesSort {
            by: ValuesSortBy::Value,
            direction: SortDirection::Asc,
        },
    }
}

fn record_matches_values_filter(
    record: &JsonValue,
    filter: &ValuesExplorerFilter,
    filter_segments: &[String],
) -> bool {
    collect_record_pattern_matches(record, filter_segments)
        .iter()
        .any(|matched| values_filter_matches(matched.value, filter))
}

fn values_filter_matches(value: &JsonValue, filter: &ValuesExplorerFilter) -> bool {
    let mut haystack = safe_str(value);
    let mut needle = filter.value.clone();

    if !filter.case_sensitive {
        haystack = haystack.to_lowercase();
        needle = needle.to_lowercase();
    }

    match filter.match_mode {
        ValuesExplorerFilterMatchMode::Contains => haystack.contains(&needle),
        ValuesExplorerFilterMatchMode::Exact => haystack == needle,
    }
}

fn total_pages(total_items: usize, page_size: usize) -> usize {
    if total_items == 0 {
        return 1;
    }

    total_items.div_ceil(page_size)
}

fn page_slice<'a, I>(items: I, page: usize, page_size: usize) -> Vec<&'a GroupAccumulator>
where
    I: Iterator<Item = &'a GroupAccumulator>,
{
    let start = page.saturating_sub(1).saturating_mul(page_size);
    items.skip(start).take(page_size).collect()
}

fn values_explorer_group_from_accumulator(group: &GroupAccumulator) -> ValuesExplorerGroup {
    let value = if group.key.len() == 1 {
        group.key[0].clone()
    } else {
        Json::Array(group.key.clone())
    };

    ValuesExplorerGroup {
        value,
        display_value: group.display_value.clone(),
        count: group.count,
        is_duplicate: group.count > 1,
        items: group
            .parent_items
            .iter()
            .map(|item| ValuesExplorerItem {
                index: item.record_index,
                item: Json::Object(
                    item.summary
                        .iter()
                        .map(|(key, value)| (key.clone(), value.clone()))
                        .collect(),
                ),
                source_path: item.source_path.clone(),
                field_value: if group.key.len() == 1 {
                    group.key[0].clone()
                } else {
                    Json::Array(group.key.clone())
                },
            })
            .collect(),
    }
}

fn sort_groups(groups: &mut [GroupAccumulator], sort: ValuesSort) {
    groups.sort_by(|left, right| {
        let primary = match sort.by {
            ValuesSortBy::Count => left.count.cmp(&right.count),
            ValuesSortBy::Value => left.display_value.cmp(&right.display_value),
            ValuesSortBy::FirstSourcePath => left.first_source_path.cmp(&right.first_source_path),
        };
        let primary = apply_direction(primary, sort.direction);

        primary
            .then_with(|| left.display_value.cmp(&right.display_value))
            .then_with(|| left.first_source_path.cmp(&right.first_source_path))
    });
}

fn apply_direction(ordering: Ordering, direction: SortDirection) -> Ordering {
    match direction {
        SortDirection::Asc => ordering,
        SortDirection::Desc => ordering.reverse(),
    }
}

fn normalize_search(search: Option<&str>) -> Option<String> {
    search
        .map(str::trim)
        .filter(|search| !search.is_empty())
        .map(str::to_lowercase)
}

fn value_to_json_key(value: &JsonValue) -> Json {
    match value {
        JsonValue::Null => Json::Null,
        JsonValue::Bool(value) => Json::Bool(*value),
        JsonValue::Number(number) => serde_json::from_str(&number.canonical_decimal())
            .unwrap_or_else(|_| Json::String(number.canonical_decimal())),
        JsonValue::String(value) => Json::String(value.clone()),
        JsonValue::Array(_) | JsonValue::Object(_) => Json::String(value.compact_json()),
    }
}

fn typed_identity(value: &JsonValue) -> String {
    match value {
        JsonValue::Null => "null:null".to_string(),
        JsonValue::Bool(value) => format!("bool:{value}"),
        JsonValue::Number(number) => format!("number:{}", number.canonical_decimal()),
        JsonValue::String(value) => format!("string:{value}"),
        JsonValue::Array(_) => format!("array:{}", value.compact_json()),
        JsonValue::Object(_) => format!("object:{}", value.compact_json()),
    }
}

fn json_display_text(value: &Json) -> String {
    match value {
        Json::Null => "null".to_string(),
        Json::Bool(value) => value.to_string(),
        Json::Number(value) => value.to_string(),
        Json::String(value) => value.clone(),
        Json::Array(_) | Json::Object(_) => value.to_string(),
    }
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

fn append_path(base: &str, segment: &str) -> String {
    if base.is_empty() {
        segment.to_string()
    } else {
        format!("{base}.{segment}")
    }
}
