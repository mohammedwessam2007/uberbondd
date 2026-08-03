"""Ties schema.py + models.py + paths.py together for record validation."""
from __future__ import annotations

from functools import lru_cache

from . import schema as schema_mod
from .models import SCHEMA_REGISTRY
from .paths import schemas_dir


@lru_cache(maxsize=None)
def _schema_for(record_type: str) -> dict:
    if record_type not in SCHEMA_REGISTRY:
        raise KeyError(f"unknown record type: {record_type}")
    return schema_mod.load_schema(schemas_dir() / SCHEMA_REGISTRY[record_type])


def validate_record(record_type: str, instance: dict) -> list[str]:
    return schema_mod.validate(instance, _schema_for(record_type), instance_name=record_type)


def validate_record_or_raise(record_type: str, instance: dict) -> None:
    errors = validate_record(record_type, instance)
    if errors:
        raise schema_mod.SchemaValidationError(record_type, "; ".join(errors))
