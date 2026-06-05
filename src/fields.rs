use serde::{Deserialize, Serialize};

use crate::json_ops::{FlattenedEntry, path_to_pattern};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FieldPattern {
    pub label: String,
    pub pattern: String,
    pub sample_paths: Vec<String>,
    pub category: String,
    pub count: usize,
}

/// Build field-pattern metadata from flattened terminal entries.
///
/// Patterns preserve first-seen order. Numeric path segments are normalized to
/// `[]`; duplicate keys and repeated array items increment counts instead of
/// being collapsed.
#[must_use]
pub fn collect_field_patterns(entries: &[FlattenedEntry<'_>]) -> Vec<FieldPattern> {
    let mut patterns: Vec<FieldPattern> = Vec::new();

    for entry in entries {
        let pattern = path_to_pattern(&entry.path);
        if let Some(existing) = patterns.iter_mut().find(|item| item.pattern == pattern) {
            existing.count += 1;
            if existing.sample_paths.len() < 5 {
                existing.sample_paths.push(entry.path.clone());
            }
            continue;
        }

        patterns.push(FieldPattern {
            label: label_for_pattern(&pattern),
            category: category_for_pattern(&pattern),
            sample_paths: vec![entry.path.clone()],
            count: 1,
            pattern,
        });
    }

    patterns
}

#[must_use]
pub fn label_for_pattern(pattern: &str) -> String {
    let segments = meaningful_segments(pattern);
    if segments.is_empty() {
        return "Root".to_string();
    }

    let leaf = segments[segments.len() - 1];
    if pattern.ends_with(".[]") || pattern == "[]" {
        return combine_label(segments.first().copied(), Some(leaf));
    }

    if leaf.eq_ignore_ascii_case("id") && segments.len() >= 2 {
        return combine_label(segments.first().copied(), Some(leaf));
    }

    if pattern.contains("[]") && segments.len() >= 3 {
        return combine_label(segments.get(segments.len() - 2).copied(), Some(leaf));
    }

    if segments.len() >= 2 {
        combine_label(segments.first().copied(), Some(leaf))
    } else {
        title_case(leaf)
    }
}

#[must_use]
pub fn category_for_pattern(pattern: &str) -> String {
    let segments = meaningful_segments(pattern);
    if segments.is_empty() {
        return "Root".to_string();
    }

    let leaf = segments[segments.len() - 1];
    if leaf.eq_ignore_ascii_case("id") || leaf.to_ascii_lowercase().ends_with("_id") {
        return "Identifier".to_string();
    }

    if pattern.ends_with(".[]") || pattern == "[]" {
        return title_case(leaf);
    }

    if pattern.contains("[]") && segments.len() >= 3 {
        return title_case(segments[segments.len() - 2]);
    }

    if pattern.contains("[]") {
        "[]".to_string()
    } else {
        title_case(segments[0])
    }
}

fn meaningful_segments(pattern: &str) -> Vec<&str> {
    pattern
        .split('.')
        .filter(|segment| !segment.is_empty() && *segment != "[]")
        .collect()
}

fn combine_label(first: Option<&str>, second: Option<&str>) -> String {
    match (first, second) {
        (Some(first), Some(second)) if first != second => {
            format!("{} {}", title_case(first), title_case(second))
        }
        (Some(first), _) => title_case(first),
        (_, Some(second)) => title_case(second),
        _ => "Root".to_string(),
    }
}

fn title_case(value: &str) -> String {
    value
        .split(['_', '-'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use crate::json_ops::flatten;
    use crate::parser::parse_json;

    use super::{category_for_pattern, collect_field_patterns, label_for_pattern};

    #[test]
    fn field_patterns_match_source_style_subset() {
        let value = parse_json(include_str!(
            "../tests/fixtures/inputs/field-patterns.json.txt"
        ))
        .unwrap();
        let entries = flatten(&value);
        let patterns = collect_field_patterns(&entries);

        let users_id = patterns
            .iter()
            .find(|item| item.pattern == "users.[].id")
            .unwrap();
        assert_eq!(users_id.label, "Users Id");
        assert_eq!(users_id.category, "Identifier");
        assert_eq!(
            users_id.sample_paths,
            vec!["users.0.id", "users.1.id", "users.2.id"]
        );
        assert_eq!(users_id.count, 3);

        let department = patterns
            .iter()
            .find(|item| item.pattern == "users.[].department")
            .unwrap();
        assert_eq!(department.label, "Users Department");
        assert_eq!(department.category, "[]");
        assert_eq!(department.count, 3);

        let email = patterns
            .iter()
            .find(|item| item.pattern == "users.[].profile.email")
            .unwrap();
        assert_eq!(email.label, "Profile Email");
        assert_eq!(email.category, "Profile");
        assert_eq!(email.count, 3);

        let tags = patterns
            .iter()
            .find(|item| item.pattern == "users.[].tags.[]")
            .unwrap();
        assert_eq!(tags.label, "Users Tags");
        assert_eq!(tags.category, "Tags");
        assert_eq!(tags.count, 3);
    }

    #[test]
    fn label_and_category_are_defined_for_root_scalars() {
        assert_eq!(label_for_pattern(""), "Root");
        assert_eq!(category_for_pattern(""), "Root");
    }
}
