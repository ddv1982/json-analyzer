use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::ast::JsonValue;
use crate::json_ops::{flatten, safe_str};

use super::structure::json_type_name;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StatisticsAnalysis {
    pub total_fields: usize,
    pub type_distribution: Vec<TypeCount>,
    pub null_count: usize,
    pub string_length_stats: StringLengthStats,
    pub field_value_distribution: Vec<ValueDistribution>,
    pub unique_field_paths: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TypeCount {
    #[serde(rename = "type")]
    pub type_name: String,
    pub count: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StringLengthStats {
    pub count: usize,
    pub min: usize,
    pub max: usize,
    pub avg: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValueDistribution {
    pub path: String,
    pub values: Vec<ValueCount>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ValueCount {
    pub value: String,
    pub count: usize,
}

/// Analyze flattened terminal-value statistics.
///
/// JSON nulls contribute to the type distribution and `null_count`, but are
/// omitted from value distribution. String length statistics include JSON
/// strings and terminal empty array/object containers stringified with
/// [`safe_str`]; numeric values do not contribute to string lengths.
#[must_use]
pub fn analyze_statistics(value: &JsonValue) -> StatisticsAnalysis {
    let entries = flatten(value);
    let mut type_distribution = OrderedCounter::default();
    let mut null_count = 0;
    let mut string_lengths = Vec::new();
    let mut field_value_distribution = OrderedPathValues::default();
    let mut unique_paths = BTreeSet::new();

    for entry in &entries {
        type_distribution.increment(json_type_name(entry.value).to_string());
        unique_paths.insert(entry.path.clone());

        match entry.value {
            JsonValue::Null => {
                null_count += 1;
            }
            JsonValue::String(value) => {
                string_lengths.push(value.chars().count());
                field_value_distribution.increment(&entry.path, value.clone());
            }
            JsonValue::Array(_) | JsonValue::Object(_) => {
                let value = safe_str(entry.value);
                string_lengths.push(value.chars().count());
                field_value_distribution.increment(&entry.path, value);
            }
            JsonValue::Bool(_) | JsonValue::Number(_) => {
                field_value_distribution.increment(&entry.path, safe_str(entry.value));
            }
        }
    }

    StatisticsAnalysis {
        total_fields: entries.len(),
        type_distribution: type_distribution.into_type_counts(),
        null_count,
        string_length_stats: string_length_stats(&string_lengths),
        field_value_distribution: field_value_distribution.into_distributions(),
        unique_field_paths: unique_paths.len(),
    }
}

fn string_length_stats(lengths: &[usize]) -> StringLengthStats {
    if lengths.is_empty() {
        return StringLengthStats {
            count: 0,
            min: 0,
            max: 0,
            avg: 0.0,
        };
    }

    let min = *lengths.iter().min().unwrap_or(&0);
    let max = *lengths.iter().max().unwrap_or(&0);
    let sum: usize = lengths.iter().sum();
    StringLengthStats {
        count: lengths.len(),
        min,
        max,
        avg: sum as f64 / lengths.len() as f64,
    }
}

#[derive(Default)]
struct OrderedCounter {
    entries: Vec<(String, usize)>,
}

impl OrderedCounter {
    fn increment(&mut self, key: String) {
        if let Some((_, count)) = self
            .entries
            .iter_mut()
            .find(|(existing, _)| existing == &key)
        {
            *count += 1;
        } else {
            self.entries.push((key, 1));
        }
    }

    fn into_type_counts(self) -> Vec<TypeCount> {
        self.entries
            .into_iter()
            .map(|(type_name, count)| TypeCount { type_name, count })
            .collect()
    }
}

#[derive(Default)]
struct OrderedPathValues {
    entries: Vec<(String, OrderedCounter)>,
}

impl OrderedPathValues {
    fn increment(&mut self, path: &str, value: String) {
        if let Some((_, values)) = self
            .entries
            .iter_mut()
            .find(|(existing, _)| existing == path)
        {
            values.increment(value);
        } else {
            let mut values = OrderedCounter::default();
            values.increment(value);
            self.entries.push((path.to_string(), values));
        }
    }

    fn into_distributions(self) -> Vec<ValueDistribution> {
        self.entries
            .into_iter()
            .map(|(path, values)| ValueDistribution {
                path,
                values: values
                    .entries
                    .into_iter()
                    .map(|(value, count)| ValueCount { value, count })
                    .collect(),
            })
            .collect()
    }
}
