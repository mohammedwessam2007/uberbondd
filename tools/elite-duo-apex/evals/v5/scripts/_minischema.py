"""Dependency-free JSON Schema draft-07 subset validator.

The benchmark factory must validate its own artifacts in a fresh container with
no network access and no `pip install`. The `jsonschema` package is not vendored
in this repository, so this module implements exactly the draft-07 keywords the
v5 schemas use and nothing more.

Supported keywords:
  type (string or list), enum, const, required, properties,
  additionalProperties (bool or schema), items (single schema),
  minItems, minLength, minimum, maximum, pattern, allOf, if/then/else.

Unsupported keywords are ignored rather than silently "passing" a construct we
did not check: `assert_schema_keywords_supported` fails loudly if a schema uses
a keyword this validator does not implement, so a future schema edit cannot
quietly disable validation.
"""

import json
import re

SUPPORTED = {
    "$schema", "$id", "title", "description", "type", "enum", "const",
    "required", "properties", "additionalProperties", "items", "minItems",
    "minLength", "minimum", "maximum", "pattern", "allOf", "if", "then",
    "else", "format",
}

# `format` is annotation-only in draft-07; we do not enforce it and say so.
IGNORED = {"$schema", "$id", "title", "description", "format"}

TYPE_MAP = {
    "object": dict,
    "array": list,
    "string": str,
    "boolean": bool,
    "number": (int, float),
    "integer": int,
    "null": type(None),
}


def _type_ok(value, name):
    if name == "null":
        return value is None
    if name == "boolean":
        return isinstance(value, bool)
    if name == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if name == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    expected = TYPE_MAP.get(name)
    if expected is None:
        raise ValueError("unknown type name: %s" % name)
    return isinstance(value, expected)


def assert_schema_keywords_supported(schema, path="#"):
    """Raise ValueError if the schema uses a keyword this validator ignores."""
    if not isinstance(schema, dict):
        return
    for key in schema:
        if key not in SUPPORTED:
            raise ValueError(
                "unsupported schema keyword %r at %s; extend _minischema.py "
                "before relying on it" % (key, path)
            )
    for key in ("if", "then", "else"):
        if key in schema:
            assert_schema_keywords_supported(schema[key], path + "/" + key)
    for name, sub in (schema.get("properties") or {}).items():
        assert_schema_keywords_supported(sub, path + "/properties/" + name)
    if isinstance(schema.get("additionalProperties"), dict):
        assert_schema_keywords_supported(
            schema["additionalProperties"], path + "/additionalProperties"
        )
    if isinstance(schema.get("items"), dict):
        assert_schema_keywords_supported(schema["items"], path + "/items")
    for i, sub in enumerate(schema.get("allOf") or []):
        assert_schema_keywords_supported(sub, "%s/allOf/%d" % (path, i))


def _matches(schema, value):
    return not validate(schema, value)


def validate(schema, value, path="$"):
    """Return a list of human-readable error strings; empty means valid."""
    errors = []
    if not isinstance(schema, dict):
        return errors

    if "type" in schema:
        names = schema["type"]
        if isinstance(names, str):
            names = [names]
        if not any(_type_ok(value, n) for n in names):
            errors.append("%s: expected type %s, got %s"
                          % (path, "|".join(names), type(value).__name__))
            return errors

    if "enum" in schema and value not in schema["enum"]:
        errors.append("%s: %r not in enum %r" % (path, value, schema["enum"]))
    if "const" in schema and value != schema["const"]:
        errors.append("%s: %r != const %r" % (path, value, schema["const"]))

    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            errors.append("%s: shorter than minLength %d"
                          % (path, schema["minLength"]))
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append("%s: %r does not match pattern %r"
                          % (path, value, schema["pattern"]))

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append("%s: %r < minimum %r" % (path, value, schema["minimum"]))
        if "maximum" in schema and value > schema["maximum"]:
            errors.append("%s: %r > maximum %r" % (path, value, schema["maximum"]))

    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            errors.append("%s: %d items < minItems %d"
                          % (path, len(value), schema["minItems"]))
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for i, item in enumerate(value):
                errors += validate(item_schema, item, "%s[%d]" % (path, i))

    if isinstance(value, dict):
        for name in schema.get("required", []):
            if name not in value:
                errors.append("%s: missing required property %r" % (path, name))
        props = schema.get("properties") or {}
        for name, sub in props.items():
            if name in value:
                errors += validate(sub, value[name], "%s.%s" % (path, name))
        extra = schema.get("additionalProperties")
        if extra is False:
            for name in value:
                if name not in props:
                    errors.append("%s: additional property %r not allowed"
                                  % (path, name))
        elif isinstance(extra, dict):
            for name, item in value.items():
                if name not in props:
                    errors += validate(extra, item, "%s.%s" % (path, name))

    for i, sub in enumerate(schema.get("allOf") or []):
        errors += validate(sub, value, path)

    if "if" in schema:
        if _matches(schema["if"], value):
            if "then" in schema:
                errors += validate(schema["then"], value, path)
        elif "else" in schema:
            errors += validate(schema["else"], value, path)

    return errors


def load_schema(path):
    with open(path, encoding="utf-8") as fh:
        schema = json.load(fh)
    assert_schema_keywords_supported(schema)
    return schema
