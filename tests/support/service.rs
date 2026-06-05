pub(crate) const GOLDEN: &str = include_str!("../fixtures/golden/source-mvp-starter-fixtures.json");
pub(crate) const PARITY_CONTRACTS: &str =
    include_str!("../fixtures/golden/full-source-parity-contracts.json");

pub(crate) const STRUCTURE_INPUT: &str = r#"{
  "users": [
    {
      "id": 1,
      "name": "Alice",
      "department": "Engineering",
      "profile": { "email": "a@example.com" },
      "tags": ["admin", "qa"]
    },
    {
      "id": 2,
      "name": "Bob",
      "department": "Engineering",
      "profile": { "email": null },
      "tags": []
    },
    {
      "id": 3,
      "name": "Carol",
      "department": "Design",
      "profile": { "email": "c@example.com" },
      "tags": ["qa"]
    }
  ],
  "metadata": { "total": 3, "source": "fixture" }
}"#;

pub(crate) const EXACT_DUPLICATES_INPUT: &str = r#"{
  "data": [
    { "id": 1, "name": "Alice" },
    { "id": 2, "name": "Bob" },
    { "id": 1, "name": "Alice" },
    {},
    null,
    ""
  ],
  "other": { "arr": [{ "x": 1 }, { "x": 2 }] }
}"#;

pub(crate) const FIELD_DUPLICATES_INPUT: &str = r#"[
  { "id": 1, "name": "Alice", "department": "Engineering" },
  { "id": 2, "name": "Bob", "department": "Engineering" },
  { "id": 3, "name": "Carol", "department": "Design" },
  { "id": 4, "name": "ALICE", "department": null },
  { "id": 5, "name": "alice", "department": "Engineering" }
]"#;

pub(crate) const MIN_MAX_INPUT: &str = r#"[
  {
    "id": 1,
    "name": "Sparse",
    "email": "",
    "details": { "age": null, "city": "" },
    "tags": []
  },
  {
    "id": 2,
    "name": "Full",
    "email": "full@example.com",
    "details": { "age": 31, "city": "Amsterdam" },
    "tags": ["alpha", "beta"]
  },
  {
    "id": 3,
    "name": "Medium",
    "email": null,
    "details": { "age": 28, "city": "Rotterdam" },
    "tags": ["solo"]
  }
]"#;

pub(crate) const PARITY_CONTRACTS_SHARED_DATASET: &str = r#"[
  {"id":1,"name":"Alice","department":"Engineering","role":"Developer","location":"Amsterdam","status":"active","profile":{"email":"alice@example.com"},"tags":["admin","qa"]},
  {"id":2,"name":"Bob","department":"Engineering","role":"Developer","location":"Rotterdam","status":"active","profile":{"email":null},"tags":["qa"]},
  {"id":3,"name":"Carol","department":"Design","role":"Designer","location":"Amsterdam","status":"active","profile":{"email":"carol@example.com"},"tags":[]},
  {"id":4,"name":"Dan","department":"Engineering","role":"Manager","location":"Utrecht","status":"inactive","profile":{"email":"dan@example.com"},"tags":["lead"]},
  {"id":5,"name":"Eve","department":"Engineering","role":"Developer","location":"Amsterdam","status":"active","profile":{"email":"eve@example.com"},"tags":["qa","release"]},
  {"id":6,"name":"Frank","department":"Support","role":"Analyst","location":"Amsterdam","status":"active","profile":{"email":"frank@example.com"},"tags":["support"]},
  {"id":7,"name":"Grace","department":"Support","role":"Analyst","location":"Haarlem","status":"inactive","profile":{"email":"grace@example.com"},"tags":[]},
  {"id":8,"name":"Heidi","department":"Design","role":"Designer","location":"Amsterdam","status":"active","profile":{},"tags":["research"]}
]"#;
