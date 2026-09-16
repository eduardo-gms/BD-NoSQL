"""
Modelo de Mantimento — controle de estoque de suprimentos nos abrigos.

Cada mantimento representa um item de suprimento vinculado a um abrigo,
com controle de quantidade, quantidade mínima (para alertas de escassez)
e histórico de movimentações (entradas e saídas).
"""

from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class MantimentoCreate(BaseModel):
    """Entrada de novo mantimento em estoque — vinculado a um abrigo."""

    model_config = ConfigDict(extra="allow")

    item: str  # obrigatório: nome do suprimento
    quantidade: int = Field(..., ge=0)  # obrigatório: qtd em estoque
    abrigo_id: str  # obrigatório: abrigo onde o mantimento está armazenado
    categoria: Optional[str] = None  # ex: "Alimento", "Higiene", "Medicamento"
    unidade: Optional[str] = None  # ex: "kg", "unidades", "litros"
    quantidade_minima: Optional[int] = Field(default=None, ge=0)  # limiar de escassez
    observacoes: Optional[str] = None


class MantimentoSaidaRequest(BaseModel):
    """Registra saída/consumo de um mantimento do estoque."""

    quantidade: int = Field(..., ge=1)
    motivo: Optional[str] = None  # ex: "Distribuição para famílias", "Uso interno"


class AssociarAbrigoRequest(BaseModel):
    """Redistribui mantimento para um abrigo em situação de escassez."""

    abrigo_destino_id: str
    quantidade: int = Field(..., ge=1)
    motivo: Optional[str] = None


def mantimento_to_dict(doc: dict[str, Any]) -> dict[str, Any]:
    """Converte o documento do Mongo (com _id ObjectId) para um dict serializável."""
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc
