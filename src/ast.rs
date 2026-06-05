use std::cmp::Ordering;
use std::fmt;

/// Maximum canonical decimal string length accepted for a JSON number.
///
/// This keeps short inputs with huge exponents, for example `1e999999999`, from
/// causing unbounded allocation when values are displayed, compared, or used by
/// duplicate/min-max analysis. The service still applies its overall JSON byte
/// limit before parsing request payloads.
const MAX_CANONICAL_DECIMAL_CHARS: usize = 1_000_000;

/// Duplicate-preserving JSON value used as the authoritative core AST.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JsonValue {
    Null,
    Bool(bool),
    Number(JsonNumber),
    String(String),
    Array(Vec<JsonValue>),
    /// Object members in source order. Duplicate keys are preserved.
    Object(Vec<(String, JsonValue)>),
}

impl JsonValue {
    #[must_use]
    pub fn compact_json(&self) -> String {
        let mut output = String::new();
        write_compact_json(self, &mut output);
        output
    }

    #[must_use]
    pub fn pretty_json(&self) -> String {
        let mut output = String::new();
        write_pretty_json(self, &mut output, 0);
        output
    }
}

/// JSON number with the original lexeme plus an exact finite decimal form.
///
/// Rules locked for Phase 2:
/// - parsing accepts only RFC 8259 JSON number grammar, so non-finite values are rejected;
/// - compact AST serialization writes the original lexeme;
/// - display/safe-string formatting uses a normalized finite decimal string;
/// - equality and ordering are numeric, so `1`, `1.0`, and `1e0` compare equal.
#[derive(Debug, Clone)]
pub struct JsonNumber {
    raw: String,
    negative: bool,
    digits: String,
    scale: i64,
}

impl JsonNumber {
    pub fn parse(raw: &str) -> Result<Self, JsonNumberError> {
        let bytes = raw.as_bytes();
        if bytes.is_empty() {
            return Err(JsonNumberError::Invalid);
        }

        let mut index = 0;
        let negative = if bytes[index] == b'-' {
            index += 1;
            if index == bytes.len() {
                return Err(JsonNumberError::Invalid);
            }
            true
        } else {
            false
        };

        let int_start = index;
        if bytes[index] == b'0' {
            index += 1;
            if index < bytes.len() && bytes[index].is_ascii_digit() {
                return Err(JsonNumberError::Invalid);
            }
        } else if (b'1'..=b'9').contains(&bytes[index]) {
            index += 1;
            while index < bytes.len() && bytes[index].is_ascii_digit() {
                index += 1;
            }
        } else {
            return Err(JsonNumberError::Invalid);
        }
        let int_part = &raw[int_start..index];

        let mut frac_part = "";
        if index < bytes.len() && bytes[index] == b'.' {
            index += 1;
            let frac_start = index;
            while index < bytes.len() && bytes[index].is_ascii_digit() {
                index += 1;
            }
            if frac_start == index {
                return Err(JsonNumberError::Invalid);
            }
            frac_part = &raw[frac_start..index];
        }

        let mut exponent: i64 = 0;
        if index < bytes.len() && matches!(bytes[index], b'e' | b'E') {
            index += 1;
            let exp_negative = if index < bytes.len() && matches!(bytes[index], b'+' | b'-') {
                let is_negative = bytes[index] == b'-';
                index += 1;
                is_negative
            } else {
                false
            };
            let exp_start = index;
            while index < bytes.len() && bytes[index].is_ascii_digit() {
                index += 1;
            }
            if exp_start == index {
                return Err(JsonNumberError::Invalid);
            }
            let exp_abs = raw[exp_start..index]
                .parse::<i64>()
                .map_err(|_| JsonNumberError::ExponentOutOfRange)?;
            exponent = if exp_negative { -exp_abs } else { exp_abs };
        }

        if index != bytes.len() {
            return Err(JsonNumberError::Invalid);
        }

        let mut digits = String::with_capacity(int_part.len() + frac_part.len());
        digits.push_str(int_part);
        digits.push_str(frac_part);
        let digits = trim_leading_zeroes(&digits);
        let mut number = Self {
            raw: raw.to_string(),
            negative,
            digits,
            scale: frac_part.len() as i64 - exponent,
        };
        if number.is_zero() {
            number.negative = false;
            number.scale = 0;
        }
        if number.canonical_decimal_len() > MAX_CANONICAL_DECIMAL_CHARS {
            return Err(JsonNumberError::DecimalExpansionOutOfRange);
        }
        Ok(number)
    }

    #[must_use]
    pub fn raw(&self) -> &str {
        &self.raw
    }

    #[must_use]
    pub fn canonical_decimal(&self) -> String {
        if self.is_zero() {
            return "0".to_string();
        }

        let mut output = String::new();
        if self.negative {
            output.push('-');
        }

        if self.scale <= 0 {
            output.push_str(&self.digits);
            for _ in 0..(-self.scale) {
                output.push('0');
            }
            return output;
        }

        let scale = usize::try_from(self.scale).unwrap_or(usize::MAX);
        if self.digits.len() <= scale {
            output.push_str("0.");
            for _ in 0..(scale - self.digits.len()) {
                output.push('0');
            }
            output.push_str(&self.digits);
        } else {
            let split = self.digits.len() - scale;
            output.push_str(&self.digits[..split]);
            output.push('.');
            output.push_str(&self.digits[split..]);
        }

        while output.ends_with('0') {
            output.pop();
        }
        if output.ends_with('.') {
            output.pop();
        }
        output
    }

    #[must_use]
    pub fn is_zero(&self) -> bool {
        self.digits == "0"
    }

    fn canonical_decimal_len(&self) -> usize {
        if self.is_zero() {
            return 1;
        }

        let sign_len = usize::from(self.negative);
        if self.scale <= 0 {
            let trailing_zeroes = usize::try_from(-self.scale).unwrap_or(usize::MAX);
            return sign_len
                .saturating_add(self.digits.len())
                .saturating_add(trailing_zeroes);
        }

        let scale = usize::try_from(self.scale).unwrap_or(usize::MAX);
        if self.digits.len() <= scale {
            sign_len
                .saturating_add(2)
                .saturating_add(scale.saturating_sub(self.digits.len()))
                .saturating_add(self.digits.len())
        } else {
            sign_len.saturating_add(self.digits.len()).saturating_add(1)
        }
    }

    fn cmp_abs(&self, other: &Self) -> Ordering {
        if self.is_zero() && other.is_zero() {
            return Ordering::Equal;
        }

        let self_integer_digits = self.digits.len() as i64 - self.scale;
        let other_integer_digits = other.digits.len() as i64 - other.scale;
        match self_integer_digits.cmp(&other_integer_digits) {
            Ordering::Equal => {}
            ordering => return ordering,
        }

        let max_scale = self.scale.max(other.scale).max(0);
        let self_aligned = aligned_digits(&self.digits, self.scale, max_scale);
        let other_aligned = aligned_digits(&other.digits, other.scale, max_scale);
        self_aligned.cmp(&other_aligned)
    }
}

impl fmt::Display for JsonNumber {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.canonical_decimal())
    }
}

impl PartialEq for JsonNumber {
    fn eq(&self, other: &Self) -> bool {
        self.negative == other.negative && self.cmp_abs(other) == Ordering::Equal
    }
}

impl Eq for JsonNumber {}

impl PartialOrd for JsonNumber {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for JsonNumber {
    fn cmp(&self, other: &Self) -> Ordering {
        match (self.negative, other.negative) {
            (true, false) => Ordering::Less,
            (false, true) => Ordering::Greater,
            (false, false) => self.cmp_abs(other),
            (true, true) => other.cmp_abs(self),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JsonNumberError {
    Invalid,
    ExponentOutOfRange,
    DecimalExpansionOutOfRange,
}

impl fmt::Display for JsonNumberError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Invalid => f.write_str("invalid JSON number"),
            Self::ExponentOutOfRange => f.write_str("JSON number exponent is out of range"),
            Self::DecimalExpansionOutOfRange => {
                f.write_str("JSON number decimal expansion is out of range")
            }
        }
    }
}

impl std::error::Error for JsonNumberError {}

fn trim_leading_zeroes(value: &str) -> String {
    let trimmed = value.trim_start_matches('0');
    if trimmed.is_empty() {
        "0".to_string()
    } else {
        trimmed.to_string()
    }
}

fn aligned_digits(digits: &str, scale: i64, max_scale: i64) -> String {
    let extra_zeroes = max_scale - scale;
    let mut output =
        String::with_capacity(digits.len() + usize::try_from(extra_zeroes).unwrap_or(0));
    output.push_str(digits);
    for _ in 0..extra_zeroes {
        output.push('0');
    }
    output
}

fn write_compact_json(value: &JsonValue, output: &mut String) {
    match value {
        JsonValue::Null => output.push_str("null"),
        JsonValue::Bool(value) => output.push_str(if *value { "true" } else { "false" }),
        JsonValue::Number(value) => output.push_str(value.raw()),
        JsonValue::String(value) => write_json_string(value, output),
        JsonValue::Array(values) => {
            output.push('[');
            for (index, value) in values.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                write_compact_json(value, output);
            }
            output.push(']');
        }
        JsonValue::Object(members) => {
            output.push('{');
            for (index, (key, value)) in members.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                write_json_string(key, output);
                output.push(':');
                write_compact_json(value, output);
            }
            output.push('}');
        }
    }
}

fn write_pretty_json(value: &JsonValue, output: &mut String, indent: usize) {
    match value {
        JsonValue::Null => output.push_str("null"),
        JsonValue::Bool(value) => output.push_str(if *value { "true" } else { "false" }),
        JsonValue::Number(value) => output.push_str(value.raw()),
        JsonValue::String(value) => write_json_string(value, output),
        JsonValue::Array(values) => {
            if values.is_empty() {
                output.push_str("[]");
                return;
            }

            output.push('[');
            output.push('\n');
            for (index, value) in values.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                    output.push('\n');
                }
                write_indent(output, indent + 2);
                write_pretty_json(value, output, indent + 2);
            }
            output.push('\n');
            write_indent(output, indent);
            output.push(']');
        }
        JsonValue::Object(members) => {
            if members.is_empty() {
                output.push_str("{}");
                return;
            }

            output.push('{');
            output.push('\n');
            for (index, (key, value)) in members.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                    output.push('\n');
                }
                write_indent(output, indent + 2);
                write_json_string(key, output);
                output.push_str(": ");
                write_pretty_json(value, output, indent + 2);
            }
            output.push('\n');
            write_indent(output, indent);
            output.push('}');
        }
    }
}

fn write_indent(output: &mut String, indent: usize) {
    for _ in 0..indent {
        output.push(' ');
    }
}

fn write_json_string(value: &str, output: &mut String) {
    output.push('"');
    for character in value.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\u{08}' => output.push_str("\\b"),
            '\u{0c}' => output.push_str("\\f"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            character if character <= '\u{1f}' => {
                output.push_str("\\u");
                output.push_str(&format!("{:04x}", character as u32));
            }
            character => output.push(character),
        }
    }
    output.push('"');
}

#[cfg(test)]
mod tests {
    use super::{JsonNumber, JsonNumberError, JsonValue};

    #[test]
    fn number_comparison_is_numeric_not_lexical() {
        let one = JsonNumber::parse("1").unwrap();
        let one_point_zero = JsonNumber::parse("1.0").unwrap();
        let one_exp = JsonNumber::parse("1e0").unwrap();
        let negative = JsonNumber::parse("-2").unwrap();
        let decimal = JsonNumber::parse("0.10").unwrap();
        let smaller_decimal = JsonNumber::parse("0.02").unwrap();

        assert_eq!(one, one_point_zero);
        assert_eq!(one, one_exp);
        assert!(negative < smaller_decimal);
        assert!(decimal > smaller_decimal);
        assert_eq!(JsonNumber::parse("1.2300").unwrap().to_string(), "1.23");
        assert_eq!(JsonNumber::parse("1e3").unwrap().to_string(), "1000");
        assert_eq!(JsonNumber::parse("-0").unwrap().to_string(), "0");
    }

    #[test]
    fn huge_decimal_expansions_are_rejected_before_display_or_comparison() {
        let huge_positive = JsonNumber::parse("1e1000001").unwrap_err();
        let huge_negative = JsonNumber::parse("1e-1000001").unwrap_err();

        assert_eq!(huge_positive, JsonNumberError::DecimalExpansionOutOfRange);
        assert_eq!(huge_negative, JsonNumberError::DecimalExpansionOutOfRange);
    }

    #[test]
    fn compact_json_preserves_member_order_duplicates_and_number_lexemes() {
        let value = JsonValue::Object(vec![
            (
                "id".to_string(),
                JsonValue::Number(JsonNumber::parse("1e0").unwrap()),
            ),
            (
                "id".to_string(),
                JsonValue::Number(JsonNumber::parse("2.0").unwrap()),
            ),
            (
                "text".to_string(),
                JsonValue::String("line\nquote\"".to_string()),
            ),
        ]);

        assert_eq!(
            value.compact_json(),
            "{\"id\":1e0,\"id\":2.0,\"text\":\"line\\nquote\\\"\"}"
        );
        assert_eq!(
            value.pretty_json(),
            "{\n  \"id\": 1e0,\n  \"id\": 2.0,\n  \"text\": \"line\\nquote\\\"\"\n}"
        );
    }
}
