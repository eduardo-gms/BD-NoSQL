"""
CRUD de Abrigos — foco em status e contagem de ocupação.
"""

from typing import Any
from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ReturnDocument

from backend.db import get_collection
from backend.models.abrigo import abrigo_to_dict


def abrigos_collection():
    return get_collection("abrigos")


class AbrigoNaoEncontrado(Exception):
    pass


class AbrigoEmUso(Exception):
    pass


def _oid(abrigo_id: str) -> ObjectId:
    try:
        return ObjectId(abrigo_id)
    except InvalidId:
        raise AbrigoNaoEncontrado(f"id inválido: {abrigo_id}")


def buscar_abrigo(abrigo_id: str) -> dict[str, Any]:
    doc = abrigos_collection().find_one({"_id": _oid(abrigo_id)})
    if not doc:
        raise AbrigoNaoEncontrado(abrigo_id)
    return abrigo_to_dict(doc)


def listar_abrigos(status: str | None = None) -> list[dict[str, Any]]:
    """Lista todos os abrigos (opcionalmente filtrando por status exato)."""
    filtro: dict[str, Any] = {}
    if status:
        filtro["status"] = status
    return [abrigo_to_dict(doc) for doc in abrigos_collection().find(filtro)]


def criar_abrigo(dados: dict[str, Any]) -> dict[str, Any]:
    """Cadastra um abrigo novo, com ocupação zerada."""
    doc = {k: v for k, v in dados.items() if v is not None}
    doc["ocupacao_atual"] = 0
    resultado = abrigos_collection().insert_one(doc)
    return buscar_abrigo(str(resultado.inserted_id))


def atualizar_abrigo(abrigo_id: str, dados: dict[str, Any]) -> dict[str, Any]:
    """
    Edição parcial: campos com valor são gravados ($set) e campos
    enviados como null são removidos ($unset).
    """
    dados = {k: v for k, v in dados.items() if k not in ("id", "_id", "ocupacao_atual")}
    if dados.get("nome") is None:
        dados.pop("nome", None)  # nome não pode ser removido
    operacao: dict[str, Any] = {}
    definir = {k: v for k, v in dados.items() if v is not None}
    remover = {k: "" for k, v in dados.items() if v is None}
    if definir:
        operacao["$set"] = definir
    if remover:
        operacao["$unset"] = remover
    if not operacao:
        return buscar_abrigo(abrigo_id)

    doc = abrigos_collection().find_one_and_update(
        {"_id": _oid(abrigo_id)}, operacao, return_document=ReturnDocument.AFTER
    )
    if not doc:
        raise AbrigoNaoEncontrado(abrigo_id)
    return abrigo_to_dict(doc)


def excluir_abrigo(abrigo_id: str) -> dict[str, Any]:
    """
    Remove o abrigo. Recusa a exclusão se ainda houver pessoas vinculadas
    ou mantimentos em estoque, para não deixar referências quebradas.
    """
    abrigo = buscar_abrigo(abrigo_id)  # levanta AbrigoNaoEncontrado

    pessoas = get_collection("pessoas_resgatadas").count_documents({"abrigo_atual": abrigo_id})
    mantimentos = get_collection("mantimentos").count_documents({"abrigo_id": abrigo_id})
    if pessoas or mantimentos:
        motivos = []
        if pessoas:
            motivos.append(f"{pessoas} pessoa(s) vinculada(s)")
        if mantimentos:
            motivos.append(f"{mantimentos} item(ns) de estoque")
        raise AbrigoEmUso(
            f"O abrigo ainda tem {' e '.join(motivos)}. "
            "Transfira as pessoas e o estoque antes de excluir."
        )

    abrigos_collection().delete_one({"_id": _oid(abrigo_id)})
    return abrigo


def atualizar_status_abrigo(abrigo_id: str, dados: dict[str, Any]) -> dict[str, Any]:
    """Atualiza status/lotação máxima e quaisquer campos extras (schema-less)."""
    dados = {k: v for k, v in dados.items() if v is not None}
    if not dados:
        return buscar_abrigo(abrigo_id)

    doc = abrigos_collection().find_one_and_update(
        {"_id": _oid(abrigo_id)},
        {"$set": dados},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise AbrigoNaoEncontrado(abrigo_id)
    return abrigo_to_dict(doc)


def reservar_vaga(abrigo_id: str) -> dict[str, Any]:
    """
    Incrementa ocupacao_atual em 1 — sem checagem de capacidade_maxima.
    Cria o campo com valor 1 se o abrigo ainda não tiver ocupacao_atual
    (caso dos "Abrigos Improvisados", que só têm capacidade_estimada).
    Lança AbrigoNaoEncontrado se o abrigo não existir.
    """
    oid = _oid(abrigo_id)

    doc = abrigos_collection().find_one_and_update(
        {"_id": oid},
        {"$inc": {"ocupacao_atual": 1}},
        return_document=ReturnDocument.AFTER,
    )
    if not doc:
        raise AbrigoNaoEncontrado(abrigo_id)
    return abrigo_to_dict(doc)


def liberar_vaga(abrigo_id: str) -> dict[str, Any]:
    """Decrementa ocupacao_atual em 1, sem deixar ir abaixo de zero."""
    oid = _oid(abrigo_id)
    doc = abrigos_collection().find_one_and_update(
        {"_id": oid, "ocupacao_atual": {"$gt": 0}},
        {"$inc": {"ocupacao_atual": -1}},
        return_document=ReturnDocument.AFTER,
    )
    if doc:
        return abrigo_to_dict(doc)
    existente = abrigos_collection().find_one({"_id": oid})
    if not existente:
        raise AbrigoNaoEncontrado(abrigo_id)
    return abrigo_to_dict(existente)  # já estava em zero, nada a fazer