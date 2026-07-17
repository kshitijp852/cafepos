"""Serialization helpers.

Writes: ``to_mongo`` turns a Pydantic model into a JSON-safe dict (datetimes
become ISO-8601 strings), matching the storage format used across the app.

Reads: no manual conversion is needed. Endpoints declare a ``response_model``,
and Pydantic v2 parses ISO-8601 strings back into ``datetime`` automatically,
so raw Mongo documents (minus ``_id``) can be returned directly.
"""
from typing import Any

from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel


def to_mongo(model: BaseModel) -> dict[str, Any]:
    return jsonable_encoder(model)
