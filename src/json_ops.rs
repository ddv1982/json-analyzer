use crate::ast::JsonValue;

#[derive(Debug, Clone)]
pub struct FlattenedEntry<'a> {
    pub path: String,
    pub value: &'a JsonValue,
}

/// Flatten terminal JSON values using source-compatible dotted paths.
///
/// Objects and arrays are traversed in source order. Duplicate object keys are
/// not collapsed; if duplicate members resolve to the same dotted path, multiple
/// entries with that path are returned in encounter order. Empty arrays/objects
/// are terminal values at their own path.
#[must_use]
pub fn flatten(value: &JsonValue) -> Vec<FlattenedEntry<'_>> {
    let mut entries = Vec::new();
    flatten_into(value, String::new(), &mut entries);
    entries
}

#[must_use]
pub fn flatten_paths(value: &JsonValue) -> Vec<String> {
    flatten(value).into_iter().map(|entry| entry.path).collect()
}

/// Source parity helper for the JSON input "flatten nested arrays" option.
///
/// This intentionally flattens exactly one level, and only when the analysis
/// root itself is a list of lists. Recursive flattening and field-path
/// normalization changes are out of scope for this option.
#[must_use]
pub fn flatten_one_level_if_list_of_lists(value: &JsonValue) -> Option<JsonValue> {
    let JsonValue::Array(values) = value else {
        return None;
    };

    if values.is_empty()
        || !values
            .iter()
            .all(|item| matches!(item, JsonValue::Array(_)))
    {
        return None;
    }

    let mut flattened = Vec::new();
    for item in values {
        let JsonValue::Array(inner) = item else {
            unreachable!("all items were checked as arrays");
        };
        flattened.extend(inner.iter().cloned());
    }

    Some(JsonValue::Array(flattened))
}

#[must_use]
pub fn path_to_pattern(path: &str) -> String {
    path.split('.')
        .map(|segment| {
            if is_numeric_segment(segment) {
                "[]"
            } else {
                segment
            }
        })
        .collect::<Vec<_>>()
        .join(".")
}

#[must_use]
pub fn safe_str(value: &JsonValue) -> String {
    match value {
        JsonValue::Null => "null".to_string(),
        JsonValue::Bool(value) => value.to_string(),
        JsonValue::Number(value) => value.to_string(),
        JsonValue::String(value) => value.clone(),
        JsonValue::Array(_) | JsonValue::Object(_) => value.compact_json(),
    }
}

fn flatten_into<'a>(value: &'a JsonValue, path: String, entries: &mut Vec<FlattenedEntry<'a>>) {
    match value {
        JsonValue::Array(values) if !values.is_empty() => {
            for (index, value) in values.iter().enumerate() {
                flatten_into(value, append_path(&path, &index.to_string()), entries);
            }
        }
        JsonValue::Object(members) if !members.is_empty() => {
            for (key, value) in members {
                flatten_into(value, append_path(&path, key), entries);
            }
        }
        _ => entries.push(FlattenedEntry { path, value }),
    }
}

fn append_path(base: &str, segment: &str) -> String {
    if base.is_empty() {
        segment.to_string()
    } else {
        format!("{base}.{segment}")
    }
}

fn is_numeric_segment(segment: &str) -> bool {
    !segment.is_empty() && segment.bytes().all(|byte| byte.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use crate::parser::parse_json;

    use super::{
        flatten, flatten_one_level_if_list_of_lists, flatten_paths, path_to_pattern, safe_str,
    };

    #[test]
    fn flatten_preserves_duplicate_paths_and_empty_containers() {
        let value =
            parse_json("{\"a\":1,\"a\":2,\"items\":[{\"x\":true},{\"x\":false}],\"empty\":[]}")
                .unwrap();
        let entries = flatten(&value);
        let paths = entries
            .iter()
            .map(|entry| entry.path.as_str())
            .collect::<Vec<_>>();

        assert_eq!(paths, vec!["a", "a", "items.0.x", "items.1.x", "empty"]);
        assert_eq!(safe_str(entries[0].value), "1");
        assert_eq!(safe_str(entries[1].value), "2");
        assert_eq!(safe_str(entries[4].value), "[]");
    }

    #[test]
    fn array_indices_normalize_to_patterns() {
        assert_eq!(
            path_to_pattern("users.10.profile.email"),
            "users.[].profile.email"
        );
        assert_eq!(path_to_pattern("0.department"), "[].department");
    }

    #[test]
    fn flatten_paths_is_source_ordered() {
        let value = parse_json("{\"b\":1,\"a\":[2,3]}").unwrap();

        assert_eq!(flatten_paths(&value), vec!["b", "a.0", "a.1"]);
    }

    #[test]
    fn source_input_flatten_option_is_one_level_and_root_only() {
        let value = parse_json("[[{\"id\":1}],[],[{\"id\":2},{\"id\":3}]]").unwrap();
        let flattened = flatten_one_level_if_list_of_lists(&value).unwrap();

        assert_eq!(flattened.compact_json(), r#"[{"id":1},{"id":2},{"id":3}]"#);

        let nested = parse_json("[[[1]],[[2]]]").unwrap();
        let flattened_nested = flatten_one_level_if_list_of_lists(&nested).unwrap();
        assert_eq!(flattened_nested.compact_json(), "[[1],[2]]");

        let object_wrapped = parse_json("{\"data\":[[1],[2]]}").unwrap();
        assert!(flatten_one_level_if_list_of_lists(&object_wrapped).is_none());

        let empty = parse_json("[]").unwrap();
        assert!(flatten_one_level_if_list_of_lists(&empty).is_none());
    }
}
