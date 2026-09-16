"""
Modelo de Doação — entrada de itens doados ao sistema.

Documentos heterogêneos: a única exigência é informar o item.
Campos opcionais como categoria, lote, validade e doador permitem
diferentes perfis de doação (anônima, institucional, com rastreio, etc.).
"""

from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, Field


class DoacaoCreate(BaseModel):
    """Criação de nova doação — aceita campos extras livremente (schema-less)."""

    model_config = ConfigDict(extra="allow")

    item: str  # obrigatório: nome do item doado
    categoria: Optional[str] = None  # ex: "Alimentos", "Medicamentos", "Roupas"
    quantidade: Optional[int] = Field(default=None, ge=1)
    unidade: Optional[str] = None  # ex: "kg", "unidades", "caixas", "litros"
    doador: Optional[str] = None  # nome do doador (pode ser anônimo)
    lote: Optional[str] = None
    validade: Optional[str] = None
    data_recebimento: Optional[str] = None
    observacoes: Optional[str] = None


class DoacaoUpdate(BaseModel):
    """Atualização parcial e schema-less — qualquer subconjunto de campos."""

    model_config = ConfigDict(extra="allow")


def doacao_to_dict(doc: dict[str, Any]) -> dict[str, Any]:
    """Converte o documento do Mongo (com _id ObjectId) para um dict serializável."""
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc
