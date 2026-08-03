"""Minimal, dependency-free JSON Schema validator.

Only the subset of Draft 2020-12 actually used by this project's schemas
is implemented: type, properties, additionalProperties, required, enum,
items, pattern, minLength, minimum, maximum. This exists because the
`jsonschema` package is not available in the offline execution
environment and this project does not perform network installs during
tests or runs.

This is intentionally not a general-purpose validator. If a schema in
schemas/ uses a keyword not implemented here, `validate()` raises
NotImplementedError rather than silently skipping the check.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

_SUPPORTED_KEYWORDS = {
    "$schema", "$id", "title", "type", "properties", "additionalProperties",
    "required", "enum", "items", "pattern", "minLength", "minimum", "maximum",
}


class SchemaValidationError(Exception):
    def __init__(self, path: str, message: str):
        self.path = path
        self.message = message
        super().__init__(f"{path}: {message}")


def load_schema(schema_path: Path) -> dict:
    with open(schema_path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _check_unsupported(schema: dict, at: str) -> None:
    unknown = set(schema.keys()) - _SUPPORTED_KEYWORDS
    if unknown:
        raise NotImplementedError(f"Unsupported schema keyword(s) at {at}: {sorted(unknown)}")
    if "properties" in schema:
        for key, sub in schema["properties"].items():
            _check_unsupported(sub, f"{at}.properties.{key}")
    if "items" in schema and isinstance(schema["items"], dict):
        _check_unsupported(schema["items"], f"{at}.items")


def _type_ok(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "null":
        return value is None
    return True


def _validate_node(value: Any, schema: dict, path: str, errors: list[str]) -> None:
    if "type" in schema:
        expected_types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_type_ok(value, t) for t in expected_types):
            errors.append(f"{path}: expected type {expected_types}, got {type(value).__name__}")
            return

    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: value {value!r} not in enum {schema['enum']}")

    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            errors.append(f"{path}: string shorter than minLength {schema['minLength']}")
        if "pattern" in schema and not re.match(schema["pattern"], value):
            errors.append(f"{path}: value {value!r} does not match pattern {schema['pattern']}")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: value {value} below minimum {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path}: value {value} above maximum {schema['maximum']}")

    if isinstance(value, dict):
        required = schema.get("required", [])
        for req in required:
            if req not in value:
                errors.append(f"{path}: missing required property '{req}'")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            allowed = set(properties.keys())
            extra = set(value.keys()) - allowed
            if extra:
                errors.append(f"{path}: additional properties not allowed: {sorted(extra)}")
        for key, sub_schema in properties.items():
            if key in value:
                _validate_node(value[key], sub_schema, f"{path}.{key}", errors)

    if isinstance(value, list) and "items" in schema:
        item_schema = schema["items"]
        for idx, item in enumerate(value):
            _validate_node(item, item_schema, f"{path}[{idx}]", errors)


def validate(instance: Any, schema: dict, *, instance_name: str = "$") -> list[str]:
    """Validate `instance` against `schema`. Returns a list of error strings (empty if valid)."""
    _check_unsupported(schema, at=instance_name)
    errors: list[str] = []
    _validate_node(instance, schema, instance_name, errors)
    return errors


def validate_or_raise(instance: Any, schema: dict, *, instance_name: str = "$") -> None:
    errors = validate(instance, schema, instance_name=instance_name)
    if errors:
        raise SchemaValidationError(instance_name, "; ".join(errors))
