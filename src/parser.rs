use std::fmt;

use crate::ast::{JsonNumber, JsonValue};

pub const DEFAULT_MAX_JSON_DEPTH: usize = 512;

/// Parse exactly one JSON root. Whitespace before/after the root is allowed;
/// any non-whitespace trailing data (including another JSON root) is an error.
pub fn parse_json(input: &str) -> Result<JsonValue, ParseError> {
    parse_json_with_max_depth(input, DEFAULT_MAX_JSON_DEPTH)
}

/// Parse exactly one JSON root with an explicit maximum container nesting depth.
pub fn parse_json_with_max_depth(input: &str, max_depth: usize) -> Result<JsonValue, ParseError> {
    let mut parser = Parser::new(input, max_depth);
    parser.skip_whitespace();
    if parser.is_eof() {
        return Err(parser.error("expected JSON value"));
    }
    let value = parser.parse_value(0)?;
    parser.skip_whitespace();
    if parser.is_eof() {
        Ok(value)
    } else {
        Err(parser.error("trailing characters after JSON root"))
    }
}

/// Parse one or more adjacent JSON roots.
///
/// This is the explicit source-style concatenated-root path. It is not used by
/// `parse_json`; callers must opt in and decide whether to treat multiple roots
/// as a document list, warning, or service-level validation error.
pub fn parse_json_documents(input: &str) -> Result<Vec<JsonValue>, ParseError> {
    parse_json_documents_with_max_depth(input, DEFAULT_MAX_JSON_DEPTH)
}

/// Parse one or more adjacent JSON roots with an explicit maximum container nesting depth.
pub fn parse_json_documents_with_max_depth(
    input: &str,
    max_depth: usize,
) -> Result<Vec<JsonValue>, ParseError> {
    let mut parser = Parser::new(input, max_depth);
    let mut documents = Vec::new();

    loop {
        parser.skip_whitespace();
        if parser.is_eof() {
            break;
        }
        documents.push(parser.parse_value(0)?);
    }

    if documents.is_empty() {
        Err(parser.error("expected JSON value"))
    } else {
        Ok(documents)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub message: String,
    pub offset: usize,
    pub line: usize,
    pub column: usize,
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{} at line {} column {} (byte {})",
            self.message, self.line, self.column, self.offset
        )
    }
}

impl std::error::Error for ParseError {}

impl ParseError {
    #[must_use]
    pub fn is_depth_exceeded(&self) -> bool {
        self.message
            .starts_with("JSON nesting exceeds maximum depth")
    }
}

struct Parser<'a> {
    input: &'a str,
    position: usize,
    max_depth: usize,
}

impl<'a> Parser<'a> {
    fn new(input: &'a str, max_depth: usize) -> Self {
        Self {
            input,
            position: 0,
            max_depth,
        }
    }

    fn parse_value(&mut self, depth: usize) -> Result<JsonValue, ParseError> {
        self.skip_whitespace();
        match self.peek_byte() {
            Some(b'n') => self.parse_literal("null", JsonValue::Null),
            Some(b't') => self.parse_literal("true", JsonValue::Bool(true)),
            Some(b'f') => self.parse_literal("false", JsonValue::Bool(false)),
            Some(b'"') => self.parse_string().map(JsonValue::String),
            Some(b'[') => self.parse_array(depth),
            Some(b'{') => self.parse_object(depth),
            Some(b'-' | b'0'..=b'9') => self.parse_number().map(JsonValue::Number),
            Some(_) => Err(self.error("expected JSON value")),
            None => Err(self.error("expected JSON value")),
        }
    }

    fn parse_literal(&mut self, literal: &str, value: JsonValue) -> Result<JsonValue, ParseError> {
        if self.input[self.position..].starts_with(literal) {
            self.position += literal.len();
            Ok(value)
        } else {
            Err(self.error("invalid JSON literal"))
        }
    }

    fn parse_array(&mut self, depth: usize) -> Result<JsonValue, ParseError> {
        self.validate_container_depth(depth)?;
        self.consume_byte(b'[')?;
        let mut values = Vec::new();
        self.skip_whitespace();
        if self.try_consume_byte(b']') {
            return Ok(JsonValue::Array(values));
        }

        loop {
            values.push(self.parse_value(depth + 1)?);
            self.skip_whitespace();
            if self.try_consume_byte(b']') {
                break;
            }
            self.consume_byte(b',')?;
            self.skip_whitespace();
            if self.peek_byte() == Some(b']') {
                return Err(self.error("trailing comma in array"));
            }
        }

        Ok(JsonValue::Array(values))
    }

    fn parse_object(&mut self, depth: usize) -> Result<JsonValue, ParseError> {
        self.validate_container_depth(depth)?;
        self.consume_byte(b'{')?;
        let mut members = Vec::new();
        self.skip_whitespace();
        if self.try_consume_byte(b'}') {
            return Ok(JsonValue::Object(members));
        }

        loop {
            self.skip_whitespace();
            if self.peek_byte() != Some(b'"') {
                return Err(self.error("expected object key string"));
            }
            let key = self.parse_string()?;
            self.skip_whitespace();
            self.consume_byte(b':')?;
            let value = self.parse_value(depth + 1)?;
            members.push((key, value));
            self.skip_whitespace();
            if self.try_consume_byte(b'}') {
                break;
            }
            self.consume_byte(b',')?;
            self.skip_whitespace();
            if self.peek_byte() == Some(b'}') {
                return Err(self.error("trailing comma in object"));
            }
        }

        Ok(JsonValue::Object(members))
    }

    fn parse_string(&mut self) -> Result<String, ParseError> {
        self.consume_byte(b'"')?;
        let mut output = String::new();

        loop {
            let Some(byte) = self.peek_byte() else {
                return Err(self.error("unterminated string"));
            };

            match byte {
                b'"' => {
                    self.position += 1;
                    return Ok(output);
                }
                b'\\' => {
                    self.position += 1;
                    output.push(self.parse_escape()?);
                }
                0x00..=0x1f => return Err(self.error("unescaped control character in string")),
                _ => {
                    let character = self
                        .peek_char()
                        .ok_or_else(|| self.error("invalid UTF-8 in string"))?;
                    self.position += character.len_utf8();
                    output.push(character);
                }
            }
        }
    }

    fn parse_escape(&mut self) -> Result<char, ParseError> {
        let Some(byte) = self.peek_byte() else {
            return Err(self.error("unterminated escape sequence"));
        };
        self.position += 1;
        match byte {
            b'"' => Ok('"'),
            b'\\' => Ok('\\'),
            b'/' => Ok('/'),
            b'b' => Ok('\u{08}'),
            b'f' => Ok('\u{0c}'),
            b'n' => Ok('\n'),
            b'r' => Ok('\r'),
            b't' => Ok('\t'),
            b'u' => self.parse_unicode_escape(),
            _ => Err(self.error("invalid escape sequence")),
        }
    }

    fn parse_unicode_escape(&mut self) -> Result<char, ParseError> {
        let high = self.parse_hex_u16()?;
        if (0xd800..=0xdbff).contains(&high) {
            if !(self.try_consume_byte(b'\\') && self.try_consume_byte(b'u')) {
                return Err(self.error("expected low surrogate after high surrogate"));
            }
            let low = self.parse_hex_u16()?;
            if !(0xdc00..=0xdfff).contains(&low) {
                return Err(self.error("invalid low surrogate"));
            }
            let codepoint =
                0x10000 + ((u32::from(high) - 0xd800) << 10) + (u32::from(low) - 0xdc00);
            char::from_u32(codepoint).ok_or_else(|| self.error("invalid unicode codepoint"))
        } else if (0xdc00..=0xdfff).contains(&high) {
            Err(self.error("low surrogate without high surrogate"))
        } else {
            char::from_u32(u32::from(high)).ok_or_else(|| self.error("invalid unicode codepoint"))
        }
    }

    fn parse_hex_u16(&mut self) -> Result<u16, ParseError> {
        if self.position + 4 > self.input.len() {
            return Err(self.error("incomplete unicode escape"));
        }
        let mut value = 0_u16;
        for _ in 0..4 {
            let Some(byte) = self.peek_byte() else {
                return Err(self.error("incomplete unicode escape"));
            };
            let digit = match byte {
                b'0'..=b'9' => u16::from(byte - b'0'),
                b'a'..=b'f' => u16::from(byte - b'a' + 10),
                b'A'..=b'F' => u16::from(byte - b'A' + 10),
                _ => return Err(self.error("invalid unicode escape")),
            };
            value = (value << 4) | digit;
            self.position += 1;
        }
        Ok(value)
    }

    fn parse_number(&mut self) -> Result<JsonNumber, ParseError> {
        let start = self.position;
        if self.peek_byte() == Some(b'-') {
            self.position += 1;
        }

        match self.peek_byte() {
            Some(b'0') => {
                self.position += 1;
                if matches!(self.peek_byte(), Some(b'0'..=b'9')) {
                    return Err(self.error("leading zero in number"));
                }
            }
            Some(b'1'..=b'9') => {
                self.position += 1;
                while matches!(self.peek_byte(), Some(b'0'..=b'9')) {
                    self.position += 1;
                }
            }
            _ => return Err(self.error("invalid number")),
        }

        if self.peek_byte() == Some(b'.') {
            self.position += 1;
            let fraction_start = self.position;
            while matches!(self.peek_byte(), Some(b'0'..=b'9')) {
                self.position += 1;
            }
            if fraction_start == self.position {
                return Err(self.error("missing digits after decimal point"));
            }
        }

        if matches!(self.peek_byte(), Some(b'e' | b'E')) {
            self.position += 1;
            if matches!(self.peek_byte(), Some(b'+' | b'-')) {
                self.position += 1;
            }
            let exponent_start = self.position;
            while matches!(self.peek_byte(), Some(b'0'..=b'9')) {
                self.position += 1;
            }
            if exponent_start == self.position {
                return Err(self.error("missing exponent digits"));
            }
        }

        JsonNumber::parse(&self.input[start..self.position])
            .map_err(|error| self.error(&error.to_string()))
    }

    fn validate_container_depth(&self, depth: usize) -> Result<(), ParseError> {
        if depth >= self.max_depth {
            Err(self.error(&format!(
                "JSON nesting exceeds maximum depth of {}",
                self.max_depth
            )))
        } else {
            Ok(())
        }
    }

    fn skip_whitespace(&mut self) {
        while matches!(self.peek_byte(), Some(b' ' | b'\n' | b'\r' | b'\t')) {
            self.position += 1;
        }
    }

    fn consume_byte(&mut self, expected: u8) -> Result<(), ParseError> {
        if self.try_consume_byte(expected) {
            Ok(())
        } else {
            Err(self.error(&format!("expected '{}'", char::from(expected))))
        }
    }

    fn try_consume_byte(&mut self, expected: u8) -> bool {
        if self.peek_byte() == Some(expected) {
            self.position += 1;
            true
        } else {
            false
        }
    }

    fn peek_byte(&self) -> Option<u8> {
        self.input.as_bytes().get(self.position).copied()
    }

    fn peek_char(&self) -> Option<char> {
        self.input[self.position..].chars().next()
    }

    fn is_eof(&self) -> bool {
        self.position >= self.input.len()
    }

    fn error(&self, message: &str) -> ParseError {
        let (line, column) = line_column(self.input, self.position);
        ParseError {
            message: message.to_string(),
            offset: self.position,
            line,
            column,
        }
    }
}

fn line_column(input: &str, offset: usize) -> (usize, usize) {
    let mut line = 1;
    let mut column = 1;
    for (index, character) in input.char_indices() {
        if index >= offset {
            break;
        }
        if character == '\n' {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }
    (line, column)
}

#[cfg(test)]
mod tests {
    use crate::ast::JsonValue;

    use super::{parse_json, parse_json_documents};

    #[test]
    fn strict_parser_rejects_concatenated_roots() {
        let error = parse_json("{\"id\":1}\n{\"id\":2}").unwrap_err();

        assert_eq!(error.message, "trailing characters after JSON root");
        assert_eq!(error.line, 2);
    }

    #[test]
    fn document_parser_accepts_concatenated_roots() {
        let values = parse_json_documents("{\"id\":1}\n[2]\ntrue").unwrap();

        assert_eq!(values.len(), 3);
        assert!(matches!(values[0], JsonValue::Object(_)));
        assert!(matches!(values[1], JsonValue::Array(_)));
        assert_eq!(values[2], JsonValue::Bool(true));
    }

    #[test]
    fn parser_decodes_strings_and_rejects_trailing_commas() {
        let value = parse_json("{\"emoji\":\"\\uD83D\\uDE00\",\"slash\":\"a\\/b\"}").unwrap();

        assert_eq!(value.compact_json(), "{\"emoji\":\"😀\",\"slash\":\"a/b\"}");
        assert!(parse_json("[1,]").is_err());
        assert!(parse_json("{\"a\":1,}").is_err());
    }
}
