"""
CRUD de Pessoas Resgatadas — cadastro, atualização e vínculo com abrigo.
"""

from typing import Any
from bson import ObjectId
from bson.errors import InvalidId

from backend.db import get_collection
from backend.models.pessoa import PessoaCreate, pessoa_to_dict
from backend.crud.abrigos import reservar_vaga, liberar_vaga, AbrigoNaoEncontrado


def pessoas_collection():
    return get_collection("pessoas_resgatadas")


class PessoaNaoEncontrada(Exception):
    pass


def _oid(pessoa_id: str) -> ObjectId:
    try:
        return ObjectId(pessoa_id)
    except InvalidId:
        raise PessoaNaoEncontrada(f"id inválido: {pessoa_id}")


def cadastrar_pessoa(dados: PessoaCreate) -> dict[str, Any]:
    """
    Insere uma pessoa resgatada. Aceita documentos heterogêneos: a única
    exigência é ter nome ou foto (validado no próprio modelo Pydantic).

    Se abrigo_atual vier preenchido, incrementa o contador de ocupação
    do abrigo (informativo, não bloqueia).
    """
    doc = dados.model_dump(exclude_none=True)
    abrigo_atual = doc.pop("abrigo_atual", None)

    if abrigo_atual:
        reservar_vaga(abrigo_atual)  # levanta AbrigoNaoEncontrado se abrigo não existir
        doc["abrigo_atual"] = abrigo_atual

    resultado = pessoas_collection().insert_one(doc)
    inserida = pessoas_collection().find_one({"_id": resultado.inserted_id})
    return pessoa_to_dict(inserida)


def buscar_pessoa(pessoa_id: str) -> dict[str, Any]:
    doc = pessoas_collection().find_one({"_id": _oid(pessoa_id)})
    if not doc:
        raise PessoaNaoEncontrada(pessoa_id)
    return pessoa_to_dict(doc)


def listar_pessoas(abrigo_atual: str | None = None) -> list[dict[str, Any]]:
    if abrigo_atual == "null":
        filtro = {"abrigo_atual": {"$in": [None, ""]}}
    elif abrigo_atual:
        filtro = {"abrigo_atual": abrigo_atual}
    else:
        filtro = {} # Retorna todo mundo se não passar filtro nenhum
        
    return [pessoa_to_dict(doc) for doc in pessoas_collection().find(filtro)]


def atualizar_pessoa(pessoa_id: str, dados: dict[str, Any]) -> dict[str, Any]:
    """Atualização parcial e schema-less — qualquer campo pode ser enviado."""
    dados = {k: v for k, v in dados.items() if v is not None and k != "abrigo_atual"}
    if dados:
        pessoas_collection().update_one({"_id": _oid(pessoa_id)}, {"$set": dados})
    return buscar_pessoa(pessoa_id)


def vincular_pessoa_abrigo(pessoa_id: str, abrigo_atual: str) -> dict[str, Any]:
    """
    Vincula (ou transfere) uma pessoa a um abrigo.

    1. Incrementa a ocupação do abrigo de destino.
    2. Se a pessoa já estava em outro abrigo, decrementa a ocupação antiga.
    3. Atualiza o campo abrigo_atual da pessoa.
    """
    pessoa = buscar_pessoa(pessoa_id)  # levanta PessoaNaoEncontrada
    abrigo_anterior = pessoa.get("abrigo_atual")

    if abrigo_anterior == abrigo_atual:
        return pessoa  # já vinculada, nada a fazer

    reservar_vaga(abrigo_atual)  # levanta AbrigoNaoEncontrado se abrigo não existir

    if abrigo_anterior:
        try:
            liberar_vaga(abrigo_anterior)
        except AbrigoNaoEncontrado:
            pass  # abrigo antigo pode ter sido removido; segue o fluxo

    pessoas_collection().update_one(
        {"_id": _oid(pessoa_id)}, {"$set": {"abrigo_atual": abrigo_atual}}
    )
    return buscar_pessoa(pessoa_id)


def desvincular_pessoa(pessoa_id: str) -> dict[str, Any]:
    pessoa = buscar_pessoa(pessoa_id)
    abrigo_atual = pessoa.get("abrigo_atual")
    if abrigo_atual:
        try:
            liberar_vaga(abrigo_atual)
        except AbrigoNaoEncontrado:
            pass
        pessoas_collection().update_one(
            {"_id": _oid(pessoa_id)}, {"$unset": {"abrigo_atual": ""}}
        )
    return buscar_pessoa(pessoa_id)