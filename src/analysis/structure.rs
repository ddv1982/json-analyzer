use serde::{Deserialize, Serialize};

use crate::ast::JsonValue;
use crate::json_ops::flatten_paths;

/// Source-style structure summary for one JSON root.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StructureAnalysis {
    #[serde(rename = "type")]
    pub value_type: String,
    pub size: usize,
    pub depth: usize,
    pub field_paths: Vec<String>,
    pub field_count: usize,
    pub schema: SchemaNode,
    pub top_level_size: usize,
    pub total_items: usize,
    pub container_summary: ContainerSummary,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContainerSummary {
    #[serde(rename = "type")]
    pub value_type: String,
    pub is_list_of_lists: bool,
    pub inner_arrays: usize,
    pub empty_inner_arrays: usize,
    pub flattened_one_level_items: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SchemaNode {
    #[serde(rename = "type")]
    pub type_name: String,
    pub value: Option<SchemaValue>,
    pub properties: Vec<SchemaProperty>,
    pub items: Option<Box<SchemaNode>>,
    pub one_of: Vec<SchemaNode>,
    pub length: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SchemaProperty {
    pub name: String,
    pub schema: SchemaNode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SchemaValue {
    Null,
    Bool(bool),
    Number(String),
    String(String),
}

/// Analyze JSON structure.
///
/// Size and `top_level_size` are shallow (`len` for arrays/objects, `1` for
/// scalars). Depth starts at zero for the root and increments for each nested
/// array/object level, matching the captured source contract.
#[must_use]
pub fn analyze_structure(value: &JsonValue) -> StructureAnalysis {
    let field_paths = flatten_paths(value);
    let size = shallow_size(value);
    StructureAnalysis {
        value_type: json_type_name(value).to_string(),
        size,
        depth: depth(value, 0),
        field_count: field_paths.len(),
        field_paths,
        schema: generate_schema(value),
        top_level_size: size,
        total_items: total_items(value, size),
        container_summary: container_summary(value),
    }
}

pub(crate) fn json_type_name(value: &JsonValue) -> &'static str {
    match value {
        JsonValue::Null => "NoneType",
        JsonValue::Bool(_) => "bool",
        JsonValue::Number(number) => json_number_type_name(number),
        JsonValue::String(_) => "str",
        JsonValue::Array(_) => "list",
        JsonValue::Object(_) => "dict",
    }
}

fn shallow_size(value: &JsonValue) -> usize {
    match value {
        JsonValue::Array(values) => values.len(),
        JsonValue::Object(members) => members.len(),
        _ => 1,
    }
}

fn depth(value: &JsonValue, current: usize) -> usize {
    match value {
        JsonValue::Array(values) => values
            .iter()
            .map(|item| depth(item, current + 1))
            .max()
            .unwrap_or(current),
        JsonValue::Object(members) => members
            .iter()
            .map(|(_, item)| depth(item, current + 1))
            .max()
            .unwrap_or(current),
        _ => current,
    }
}

fn total_items(value: &JsonValue, size: usize) -> usize {
    if let JsonValue::Array(values) = value
        && !values.is_empty()
        && values
            .iter()
            .all(|item| matches!(item, JsonValue::Array(_)))
    {
        return values
            .iter()
            .map(|item| match item {
                JsonValue::Array(inner) => inner.len(),
                _ => 0,
            })
            .sum();
    }
    size
}

fn container_summary(value: &JsonValue) -> ContainerSummary {
    match value {
        JsonValue::Array(values)
            if !values.is_empty()
                && values
                    .iter()
                    .all(|item| matches!(item, JsonValue::Array(_))) =>
        {
            let inner_arrays = values.len();
            let empty_inner_arrays = values
                .iter()
                .filter(|item| matches!(item, JsonValue::Array(inner) if inner.is_empty()))
                .count();
            let flattened_one_level_items = values
                .iter()
                .map(|item| match item {
                    JsonValue::Array(inner) => inner.len(),
                    _ => 0,
                })
                .sum();
            ContainerSummary {
                value_type: json_type_name(value).to_string(),
                is_list_of_lists: true,
                inner_arrays,
                empty_inner_arrays,
                flattened_one_level_items,
            }
        }
        _ => ContainerSummary {
            value_type: json_type_name(value).to_string(),
            is_list_of_lists: false,
            inner_arrays: 0,
            empty_inner_arrays: 0,
            flattened_one_level_items: 0,
        },
    }
}

fn generate_schema(value: &JsonValue) -> SchemaNode {
    match value {
        JsonValue::Object(members) => {
            let mut properties: Vec<SchemaProperty> = Vec::new();
            for (name, member_value) in members {
                let member_schema = generate_schema(member_value);
                if let Some(existing) = properties
                    .iter_mut()
                    .find(|property| property.name == *name)
                {
                    existing.schema = merge_schema(&existing.schema, &member_schema);
                } else {
                    properties.push(SchemaProperty {
                        name: name.clone(),
                        schema: member_schema,
                    });
                }
            }
            SchemaNode::object(properties)
        }
        JsonValue::Array(values) => {
            let items = values
                .iter()
                .take(5)
                .map(generate_schema)
                .reduce(|left, right| merge_schema(&left, &right));
            SchemaNode {
                type_name: "array".to_string(),
                value: None,
                properties: Vec::new(),
                items: items.map(Box::new),
                one_of: Vec::new(),
                length: Some(values.len()),
            }
        }
        JsonValue::Null => SchemaNode::scalar("NoneType", SchemaValue::Null),
        JsonValue::Bool(value) => SchemaNode::scalar("bool", SchemaValue::Bool(*value)),
        JsonValue::Number(value) => SchemaNode::scalar(
            json_number_type_name(value),
            SchemaValue::Number(value.to_string()),
        ),
        JsonValue::String(value) => SchemaNode::scalar("str", SchemaValue::String(value.clone())),
    }
}

fn json_number_type_name(number: &crate::JsonNumber) -> &'static str {
    if number.raw().contains(['.', 'e', 'E']) {
        "float"
    } else {
        "int"
    }
}

fn merge_schema(left: &SchemaNode, right: &SchemaNode) -> SchemaNode {
    if left.type_name == right.type_name && left.type_name != "union" {
        return match left.type_name.as_str() {
            "object" => merge_object_schema(left, right),
            "array" => merge_array_schema(left, right),
            _ => left.clone(),
        };
    }

    let mut one_of = Vec::new();
    append_union_member(&mut one_of, left.clone());
    append_union_member(&mut one_of, right.clone());
    SchemaNode {
        type_name: "union".to_string(),
        value: None,
        properties: Vec::new(),
        items: None,
        one_of,
        length: None,
    }
}

fn merge_object_schema(left: &SchemaNode, right: &SchemaNode) -> SchemaNode {
    let mut properties = left.properties.clone();
    for property in &right.properties {
        if let Some(existing) = properties
            .iter_mut()
            .find(|item| item.name == property.name)
        {
            existing.schema = merge_schema(&existing.schema, &property.schema);
        } else {
            properties.push(property.clone());
        }
    }
    SchemaNode::object(properties)
}

fn merge_array_schema(left: &SchemaNode, right: &SchemaNode) -> SchemaNode {
    let items = match (&left.items, &right.items) {
        (Some(left), Some(right)) => Some(Box::new(merge_schema(left, right))),
        (Some(left), None) => Some(left.clone()),
        (None, Some(right)) => Some(right.clone()),
        (None, None) => None,
    };
    SchemaNode {
        type_name: "array".to_string(),
        value: None,
        properties: Vec::new(),
        items,
        one_of: Vec::new(),
        length: left.length.or(right.length),
    }
}

fn append_union_member(one_of: &mut Vec<SchemaNode>, schema: SchemaNode) {
    if schema.type_name == "union" {
        for member in schema.one_of {
            append_union_member(one_of, member);
        }
        return;
    }

    if !one_of.iter().any(|existing| existing == &schema) {
        one_of.push(schema);
    }
}

impl SchemaNode {
    fn object(properties: Vec<SchemaProperty>) -> Self {
        Self {
            type_name: "object".to_string(),
            value: None,
            properties,
            items: None,
            one_of: Vec::new(),
            length: None,
        }
    }

    fn scalar(type_name: &str, value: SchemaValue) -> Self {
        Self {
            type_name: type_name.to_string(),
            value: Some(value),
            properties: Vec::new(),
            items: None,
            one_of: Vec::new(),
            length: None,
        }
    }
}
