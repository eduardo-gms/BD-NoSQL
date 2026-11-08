"""
Modelo de Abrigo.
"""

from typing import Any, Literal, Optional
from pydantic import ConfigDict, Field, field_validator
from backend.models.campos_documento import DocumentoComChavesValidas


class AbrigoCampos(DocumentoComChavesValidas):
    @field_validator("status", mode="before", check_fields=False)
    @classmethod
    def normalizar_status(cls, valor):
        if isinstance(valor, str):
            return valor.strip().lower()
        return valor


class AbrigoCreate(AbrigoCampos):
    """Cadastro de abrigo. Só o nome é obrigatório; aceita campos extras."""

    model_config = ConfigDict(extra="allow", str_strip_whitespace=True)

    nome: str = Field(..., min_length=1)
    endereco: Optional[str] = None
    coordenador: Optional[str] = None
    capacidade_maxima: Optional[int] = Field(default=None, ge=1)
    capacidade_estimada: Optional[int] = Field(default=None, ge=1)
    status: Literal["aberto", "fechado"] = "aberto"
    necessidades_urgentes: Optional[list[str]] = None


class AbrigoUpdate(AbrigoCampos):
    """
    Edição parcial. Campos removíveis enviados com null são removidos.
    Funcionamento não aceita null: use aberto ou fechado.
    A ocupação não é editável: ela muda ao vincular/desvincular pessoas.
    """

    model_config = ConfigDict(extra="allow", str_strip_whitespace=True)

    nome: Optional[str] = Field(default=None, min_length=1)
    endereco: Optional[str] = None
    coordenador: Optional[str] = None
    status: Literal["aberto", "fechado"] = "aberto"
    capacidade_maxima: Optional[int] = Field(default=None, ge=1)
    capacidade_estimada: Optional[int] = Field(default=None, ge=1)
    necessidades_urgentes: Optional[list[str]] = None


class AbrigoStatusUpdate(AbrigoUpdate):
    """Usa as mesmas validações da edição, inclusive para campos extras conhecidos."""


def abrigo_to_dict(doc: dict[str, Any]) -> dict[str, Any]:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc
