"""
Modelo de Abrigo.
"""

from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class AbrigoStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="allow")

    status: Optional[str] = None  # ex: "aberto", "Superlotado", "fechado"
    capacidade_maxima: Optional[int] = None


class AbrigoCreate(BaseModel):
    """Cadastro de abrigo. Só o nome é obrigatório; aceita campos extras."""

    model_config = ConfigDict(extra="allow")

    nome: str = Field(..., min_length=1)
    endereco: Optional[str] = None
    coordenador: Optional[str] = None
    capacidade_maxima: Optional[int] = Field(default=None, ge=1)
    status: Optional[str] = "aberto"
    necessidades_urgentes: Optional[list[str]] = None


class AbrigoUpdate(BaseModel):
    """
    Edição parcial. Campos enviados com null são removidos do documento.
    A ocupação não é editável: ela muda ao vincular/desvincular pessoas.
    """

    model_config = ConfigDict(extra="allow")

    nome: Optional[str] = Field(default=None, min_length=1)
    capacidade_maxima: Optional[int] = Field(default=None, ge=1)
    necessidades_urgentes: Optional[list[str]] = None


def abrigo_to_dict(doc: dict[str, Any]) -> dict[str, Any]:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc