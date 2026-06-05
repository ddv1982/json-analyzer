use serde::{Deserialize, Serialize};

use crate::ast::JsonValue;

use super::duplicates::{CandidateMode, best_array_candidate, format_analysis_path};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MinMaxFilledResult {
    pub analysis_path: String,
    pub total_records: usize,
    pub min_records: Vec<MinMaxRecord>,
    pub max_records: Vec<MinMaxRecord>,
    pub statistics: MinMaxStatistics,
    pub has_records: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MinMaxRecord {
    pub index: usize,
    pub filled_count: usize,
    pub total_fields: usize,
    pub completeness_pct: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MinMaxStatistics {
    pub total_records: usize,
    pub avg_filled_fields: f64,
    pub median_filled_fields: f64,
    pub std_filled_fields: f64,
    pub avg_completeness_pct: f64,
    pub field_count_distribution: Vec<CountDistribution>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CountDistribution {
    pub filled_count: usize,
    pub count: usize,
}

/// Find records with minimum and maximum filled field counts.
///
/// Candidate arrays must contain object records. Filled values exclude null,
/// blank strings, and empty arrays/objects. Deep mode recursively counts scalar
/// leaves inside containers; shallow mode counts each top-level non-empty
/// container as one filled field. All ties are returned in input order.
#[must_use]
pub fn analyze_min_max_filled(value: &JsonValue, deep: bool) -> MinMaxFilledResult {
    let Some(candidate) = best_array_candidate(value, CandidateMode::Records) else {
        return MinMaxFilledResult::empty("No suitable array found");
    };

    let records = candidate
        .items
        .iter()
        .enumerate()
        .filter_map(|(index, item)| match item {
            JsonValue::Object(_) => Some(record_summary(index, item, deep)),
            _ => None,
        })
        .collect::<Vec<_>>();

    if records.is_empty() {
        return MinMaxFilledResult::empty("No suitable array found");
    }

    let min_filled = records
        .iter()
        .map(|record| record.filled_count)
        .min()
        .unwrap_or(0);
    let max_filled = records
        .iter()
        .map(|record| record.filled_count)
        .max()
        .unwrap_or(0);
    let min_records = records
        .iter()
        .filter(|record| record.filled_count == min_filled)
        .cloned()
        .collect::<Vec<_>>();
    let max_records = records
        .iter()
        .filter(|record| record.filled_count == max_filled)
        .cloned()
        .collect::<Vec<_>>();

    MinMaxFilledResult {
        analysis_path: format_analysis_path(&candidate.path, candidate.items.len()),
        total_records: records.len(),
        statistics: statistics(&records),
        min_records,
        max_records,
        has_records: true,
    }
}

fn record_summary(index: usize, record: &JsonValue, deep: bool) -> MinMaxRecord {
    let filled_count = if deep {
        deep_filled_count(record)
    } else {
        shallow_filled_count(record)
    };
    let total_fields = if deep {
        deep_total_fields(record)
    } else {
        shallow_total_fields(record)
    };
    let completeness_pct = if total_fields == 0 {
        0.0
    } else {
        filled_count as f64 / total_fields as f64 * 100.0
    };
    MinMaxRecord {
        index,
        filled_count,
        total_fields,
        completeness_pct,
    }
}

fn shallow_filled_count(record: &JsonValue) -> usize {
    match record {
        JsonValue::Object(members) => members
            .iter()
            .filter(|(_, value)| is_filled_value(value))
            .count(),
        value => usize::from(is_filled_value(value)),
    }
}

fn shallow_total_fields(record: &JsonValue) -> usize {
    match record {
        JsonValue::Object(members) => members.len(),
        _ => 1,
    }
}

fn deep_filled_count(value: &JsonValue) -> usize {
    if !is_filled_value(value) {
        return 0;
    }

    match value {
        JsonValue::Object(members) => members
            .iter()
            .map(|(_, value)| deep_filled_count(value))
            .sum(),
        JsonValue::Array(values) => values.iter().map(deep_filled_count).sum(),
        JsonValue::Null | JsonValue::Bool(_) | JsonValue::Number(_) | JsonValue::String(_) => 1,
    }
}

fn deep_total_fields(value: &JsonValue) -> usize {
    match value {
        JsonValue::Object(members) => members
            .iter()
            .map(|(_, value)| deep_total_fields(value))
            .sum(),
        JsonValue::Array(values) => values.iter().map(deep_total_fields).sum(),
        JsonValue::Null | JsonValue::Bool(_) | JsonValue::Number(_) | JsonValue::String(_) => 1,
    }
}

fn is_filled_value(value: &JsonValue) -> bool {
    match value {
        JsonValue::Null => false,
        JsonValue::String(value) => !value.trim().is_empty(),
        JsonValue::Array(values) => !values.is_empty(),
        JsonValue::Object(members) => !members.is_empty(),
        JsonValue::Bool(_) | JsonValue::Number(_) => true,
    }
}

fn statistics(records: &[MinMaxRecord]) -> MinMaxStatistics {
    let filled_counts = records
        .iter()
        .map(|record| record.filled_count)
        .collect::<Vec<_>>();
    let completeness_values = records
        .iter()
        .map(|record| record.completeness_pct)
        .collect::<Vec<_>>();

    MinMaxStatistics {
        total_records: records.len(),
        avg_filled_fields: mean_usize(&filled_counts),
        median_filled_fields: median_usize(&filled_counts),
        std_filled_fields: sample_std_usize(&filled_counts),
        avg_completeness_pct: mean_f64(&completeness_values),
        field_count_distribution: count_distribution(&filled_counts),
    }
}

fn mean_usize(values: &[usize]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<usize>() as f64 / values.len() as f64
    }
}

fn mean_f64(values: &[f64]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<f64>() / values.len() as f64
    }
}

fn median_usize(values: &[usize]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }

    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    let middle = sorted.len() / 2;
    if sorted.len().is_multiple_of(2) {
        (sorted[middle - 1] + sorted[middle]) as f64 / 2.0
    } else {
        sorted[middle] as f64
    }
}

fn sample_std_usize(values: &[usize]) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }

    let mean = mean_usize(values);
    let variance = values
        .iter()
        .map(|value| {
            let delta = *value as f64 - mean;
            delta * delta
        })
        .sum::<f64>()
        / (values.len() - 1) as f64;
    variance.sqrt()
}

fn count_distribution(values: &[usize]) -> Vec<CountDistribution> {
    let mut distribution: Vec<CountDistribution> = Vec::new();
    for value in values {
        if let Some(existing) = distribution
            .iter_mut()
            .find(|item| item.filled_count == *value)
        {
            existing.count += 1;
        } else {
            distribution.push(CountDistribution {
                filled_count: *value,
                count: 1,
            });
        }
    }
    distribution
}

impl MinMaxFilledResult {
    fn empty(analysis_path: &str) -> Self {
        Self {
            analysis_path: analysis_path.to_string(),
            total_records: 0,
            min_records: Vec::new(),
            max_records: Vec::new(),
            statistics: MinMaxStatistics {
                total_records: 0,
                avg_filled_fields: 0.0,
                median_filled_fields: 0.0,
                std_filled_fields: 0.0,
                avg_completeness_pct: 0.0,
                field_count_distribution: Vec::new(),
            },
            has_records: false,
        }
    }
}
