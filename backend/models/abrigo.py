"""
Modelo de Abrigo.
"""

from typing import Any, Optional
from pydantic import ConfigDict, Field
from backend.models.campos_documento import DocumentoComChavesValidas


class AbrigoCreate(DocumentoComChavesValidas):
    """Cadastro de abrigo. Só o nome é obrigatório; aceita campos extras."""

    model_config = ConfigDict(extra="allow", str_strip_whitespace=True)

    nome: str = Field(..., min_length=1)
    endereco: Optional[str] = None
    coordenador: Optional[str] = None
    capacidade_maxima: Optional[int] = Field(default=None, ge=1)
    capacidade_estimada: Optional[int] = Field(default=None, ge=1)
    status: Optional[str] = "aberto"
    necessidades_urgentes: Optional[list[str]] = None


class AbrigoUpdate(DocumentoComChavesValidas):
    """
    Edição parcial. Campos enviados com null são removidos do documento.
    A ocupação não é editável: ela muda ao vincular/desvincular pessoas.
    """

    model_config = ConfigDict(extra="allow", str_strip_whitespace=True)

    nome: Optional[str] = Field(default=None, min_length=1)
    endereco: Optional[str] = None
    coordenador: Optional[str] = None
    status: Optional[str] = None
    capacidade_maxima: Optional[int] = Field(default=None, ge=1)
    capacidade_estimada: Optional[int] = Field(default=None, ge=1)
    necessidades_urgentes: Optional[list[str]] = None


class AbrigoStatusUpdate(AbrigoUpdate):
    """Usa as mesmas validações da edição, inclusive para campos extras conhecidos."""


def abrigo_to_dict(doc: dict[str, Any]) -> dict[str, Any]:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc
