"""
Modelo de Abrigo.
"""

from typing import Any, Optional
from pydantic import BaseModel, ConfigDict


class AbrigoStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="allow")

    status: Optional[str] = None  # ex: "aberto", "Superlotado", "fechado"
    capacidade_maxima: Optional[int] = None


def abrigo_to_dict(doc: dict[str, Any]) -> dict[str, Any]:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc