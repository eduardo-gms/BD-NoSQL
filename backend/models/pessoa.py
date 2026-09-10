"""
Modelo de Pessoa Resgatada.
"""

from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, model_validator


class PessoaCreate(BaseModel):
    model_config = ConfigDict(extra="allow")  # aceita qualquer campo adicional

    # nomes variam entre perfis gerados pelo povoamento
    nome: Optional[str] = None
    nome_conhecido: Optional[str] = None
    nome_completo: Optional[str] = None
    foto: Optional[str] = None

    local_resgate: Optional[str] = None
    data_resgate: Optional[str] = None
    idade: Optional[int] = None
    cpf: Optional[str] = None
    tipo_sanguineo: Optional[str] = None
    condicoes_saude: Optional[dict[str, Any]] = None
    contatos_emergencia: Optional[list[dict[str, Any]]] = None

    abrigo_atual: Optional[str] = None  # vínculo opcional já na criação

    @model_validator(mode="after")
    def exige_nome_ou_foto(self) -> "PessoaCreate":
        tem_nome = self.nome or self.nome_conhecido or self.nome_completo
        if not tem_nome and not self.foto:
            raise ValueError(
                "É necessário informar ao menos um nome "
                "(nome, nome_conhecido ou nome_completo) ou 'foto' para "
                "cadastrar uma pessoa resgatada."
            )
        return self


class PessoaUpdate(BaseModel):
    """Atualização parcial — qualquer subconjunto de campos, inclusive novos."""

    model_config = ConfigDict(extra="allow")


class VincularAbrigoRequest(BaseModel):
    abrigo_atual: str


def pessoa_to_dict(doc: dict[str, Any]) -> dict[str, Any]:
    """Converte o documento do Mongo (com _id ObjectId) para um dict serializável."""
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc