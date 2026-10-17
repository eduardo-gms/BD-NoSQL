"""
CRUD de Doações — registro de entrada, consulta e atualização de doações.
"""

from datetime import datetime, timezone
from typing import Any, Optional
from bson import ObjectId
from bson.errors import InvalidId

from backend.db import get_collection
from backend.models.doacao import DoacaoCreate, doacao_to_dict


def doacoes_collection():
    return get_collection("doacoes")


class DoacaoNaoEncontrada(Exception):
    pass


class DoacaoJaDestinada(Exception):
    pass


def _oid(doacao_id: str) -> ObjectId:
    try:
        return ObjectId(doacao_id)
    except InvalidId:
        raise DoacaoNaoEncontrada(f"id inválido: {doacao_id}")


def registrar_doacao(dados: DoacaoCreate) -> dict[str, Any]:
    """
    Registra uma nova doação no sistema.

    Aceita documentos heterogêneos (schema-less): a única exigência é
    informar o item doado. Campos como categoria, lote, validade e doador
    são opcionais e permitem diferentes perfis de doação.

    Adiciona automaticamente o campo `data_registro` com o timestamp UTC
    da inserção caso `data_recebimento` não tenha sido informado.
    """
    doc = dados.model_dump(exclude_none=True)

    if "data_recebimento" not in doc:
        doc["data_registro"] = datetime.now(timezone.utc).isoformat()

    resultado = doacoes_collection().insert_one(doc)
    inserida = doacoes_collection().find_one({"_id": resultado.inserted_id})
    return doacao_to_dict(inserida)


def buscar_doacao(doacao_id: str) -> dict[str, Any]:
    doc = doacoes_collection().find_one({"_id": _oid(doacao_id)})
    if not doc:
        raise DoacaoNaoEncontrada(doacao_id)
    return doacao_to_dict(doc)


def listar_doacoes(
    categoria: Optional[str] = None,
    item: Optional[str] = None,
    doador: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Lista doações com filtros opcionais.

    - categoria: filtra por categoria exata
    - item: busca parcial (regex case-insensitive) no nome do item
    - doador: busca parcial (regex case-insensitive) no nome do doador
    """
    filtro: dict[str, Any] = {}

    if categoria:
        filtro["categoria"] = categoria
    if item:
        filtro["item"] = {"$regex": item, "$options": "i"}
    if doador:
        filtro["doador"] = {"$regex": doador, "$options": "i"}

    return [doacao_to_dict(doc) for doc in doacoes_collection().find(filtro)]


def atualizar_doacao(doacao_id: str, dados: dict[str, Any]) -> dict[str, Any]:
    """Atualização parcial e schema-less — qualquer campo pode ser enviado."""
    dados = {k: v for k, v in dados.items() if v is not None}
    if dados:
        doacoes_collection().update_one({"_id": _oid(doacao_id)}, {"$set": dados})
    return buscar_doacao(doacao_id)


def deletar_doacao(doacao_id: str) -> dict[str, Any]:
    """Remove uma doação do sistema. Retorna o documento antes da remoção."""
    doc = buscar_doacao(doacao_id)  # levanta DoacaoNaoEncontrada se não existir
    doacoes_collection().delete_one({"_id": _oid(doacao_id)})
    return doc


def destinar_doacao(
    doacao_id: str, abrigo_id: str, quantidade: Optional[int] = None
) -> dict[str, Any]:
    """
    Envia uma doação para o estoque de um abrigo.

    1. Dá entrada do item nos mantimentos do abrigo (somando se o item já existir).
    2. Marca a doação com o campo `destinacao`, para não ser enviada duas vezes.

    Retorna a doação atualizada e o mantimento que recebeu a entrada.
    """
    from backend.crud.mantimentos import dar_entrada_mantimento

    doacao = buscar_doacao(doacao_id)
    if doacao.get("destinacao"):
        raise DoacaoJaDestinada("Esta doação já foi enviada para um abrigo.")

    # doações antigas usam quantidade_exata ou quantidade_estimada
    quantidade = quantidade or doacao.get("quantidade") or doacao.get("quantidade_exata") or doacao.get("quantidade_estimada")
    if not quantidade:
        raise ValueError("A doação não tem quantidade registrada. Informe a quantidade a enviar.")

    entrada = {
        "item": doacao["item"],
        "quantidade": quantidade,
        "abrigo_id": abrigo_id,
        "categoria": doacao.get("categoria"),
        "unidade": doacao.get("unidade"),
    }
    mantimento, _ = dar_entrada_mantimento(
        entrada,
        descricao=f"Doação de {doacao.get('doador') or 'doador anônimo'}",
        extra_historico={"doacao_id": doacao_id},
    )

    destinacao = {
        "abrigo_id": abrigo_id,
        "mantimento_id": mantimento["id"],
        "quantidade": quantidade,
        "data": datetime.now(timezone.utc).isoformat(),
    }
    doacoes_collection().update_one({"_id": _oid(doacao_id)}, {"$set": {"destinacao": destinacao}})
    return {"doacao": buscar_doacao(doacao_id), "mantimento": mantimento}
