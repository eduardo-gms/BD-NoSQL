"""
CRUD de Mantimentos — controle de estoque de suprimentos nos abrigos.

Gerencia entradas, saídas, redistribuição entre abrigos e detecção
de situações de escassez.
"""

from datetime import datetime, timezone
from typing import Any, Optional
from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ReturnDocument

from backend.db import get_collection
from backend.models.mantimento import mantimento_to_dict
from backend.crud.abrigos import buscar_abrigo, AbrigoNaoEncontrado


def mantimentos_collection():
    return get_collection("mantimentos")


class MantimentoNaoEncontrado(Exception):
    pass


class EstoqueInsuficiente(Exception):
    pass


def _oid(mantimento_id: str) -> ObjectId:
    try:
        return ObjectId(mantimento_id)
    except InvalidId:
        raise MantimentoNaoEncontrado(f"id inválido: {mantimento_id}")


def _agora_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ──────────────────────────────────────────────────────────────────
# Entrada de mantimentos
# ──────────────────────────────────────────────────────────────────


def dar_entrada_mantimento(dados: dict[str, Any]) -> dict[str, Any]:
    """
    Dá entrada em um novo mantimento vinculado a um abrigo.

    Valida que o abrigo existe antes de inserir. Registra a movimentação
    de entrada no histórico do documento.
    """
    abrigo_id = dados.get("abrigo_id")
    if not abrigo_id:
        raise ValueError("abrigo_id é obrigatório.")

    # Valida que o abrigo existe
    buscar_abrigo(abrigo_id)  # levanta AbrigoNaoEncontrado se não existir

    doc = {k: v for k, v in dados.items() if v is not None}
    doc["data_entrada"] = _agora_iso()
    doc["historico"] = [
        {
            "tipo": "entrada",
            "quantidade": doc.get("quantidade", 0),
            "data": doc["data_entrada"],
            "descricao": "Entrada inicial no estoque",
        }
    ]

    resultado = mantimentos_collection().insert_one(doc)
    inserido = mantimentos_collection().find_one({"_id": resultado.inserted_id})
    return mantimento_to_dict(inserido)


# ──────────────────────────────────────────────────────────────────
# Saída / consumo de mantimentos
# ──────────────────────────────────────────────────────────────────


def registrar_saida(
    mantimento_id: str, quantidade: int, motivo: Optional[str] = None
) -> dict[str, Any]:
    """
    Registra saída/consumo de um mantimento do estoque.

    - Decrementa a quantidade em estoque.
    - Não permite que a quantidade fique negativa.
    - Registra a movimentação no histórico do documento.
    """
    oid = _oid(mantimento_id)
    doc = mantimentos_collection().find_one({"_id": oid})
    if not doc:
        raise MantimentoNaoEncontrado(mantimento_id)

    estoque_atual = doc.get("quantidade", 0)
    if quantidade > estoque_atual:
        raise EstoqueInsuficiente(
            f"Estoque insuficiente. Disponível: {estoque_atual}, "
            f"solicitado: {quantidade}."
        )

    registro_saida = {
        "tipo": "saida",
        "quantidade": quantidade,
        "data": _agora_iso(),
        "descricao": motivo or "Saída de estoque",
    }

    atualizado = mantimentos_collection().find_one_and_update(
        {"_id": oid},
        {
            "$inc": {"quantidade": -quantidade},
            "$push": {"historico": registro_saida},
        },
        return_document=ReturnDocument.AFTER,
    )
    return mantimento_to_dict(atualizado)


# ──────────────────────────────────────────────────────────────────
# Consultas
# ──────────────────────────────────────────────────────────────────


def buscar_mantimento(mantimento_id: str) -> dict[str, Any]:
    doc = mantimentos_collection().find_one({"_id": _oid(mantimento_id)})
    if not doc:
        raise MantimentoNaoEncontrado(mantimento_id)
    return mantimento_to_dict(doc)


def listar_mantimentos(
    abrigo_id: Optional[str] = None,
    item: Optional[str] = None,
    estoque_baixo: bool = False,
) -> list[dict[str, Any]]:
    """
    Lista mantimentos com filtros opcionais.

    - abrigo_id: filtra por abrigo
    - item: busca parcial (regex case-insensitive) no nome do item
    - estoque_baixo: retorna apenas mantimentos cuja quantidade está
      abaixo da quantidade_minima definida
    """
    filtro: dict[str, Any] = {}

    if abrigo_id:
        filtro["abrigo_id"] = abrigo_id
    if item:
        filtro["item"] = {"$regex": item, "$options": "i"}
    if estoque_baixo:
        # Usa $expr para comparar dois campos do mesmo documento
        filtro["$expr"] = {"$lt": ["$quantidade", "$quantidade_minima"]}

    return [mantimento_to_dict(doc) for doc in mantimentos_collection().find(filtro)]


# ──────────────────────────────────────────────────────────────────
# Redistribuição / associação a abrigo em escassez
# ──────────────────────────────────────────────────────────────────


def associar_abrigo_escassez(
    mantimento_id: str,
    abrigo_destino_id: str,
    quantidade: int,
    motivo: Optional[str] = None,
) -> dict[str, Any]:
    """
    Redistribui mantimentos de um abrigo para outro em situação de escassez.

    1. Valida que o abrigo de destino existe.
    2. Decrementa a quantidade do mantimento de origem.
    3. Cria (ou incrementa) um registro de mantimento no abrigo de destino.
    4. Registra a movimentação no histórico de ambos os documentos.

    Retorna o mantimento de origem atualizado.
    """
    # Valida abrigo de destino
    buscar_abrigo(abrigo_destino_id)  # levanta AbrigoNaoEncontrado

    # Busca mantimento de origem
    oid = _oid(mantimento_id)
    doc_origem = mantimentos_collection().find_one({"_id": oid})
    if not doc_origem:
        raise MantimentoNaoEncontrado(mantimento_id)

    estoque_atual = doc_origem.get("quantidade", 0)
    if quantidade > estoque_atual:
        raise EstoqueInsuficiente(
            f"Estoque insuficiente para redistribuição. "
            f"Disponível: {estoque_atual}, solicitado: {quantidade}."
        )

    agora = _agora_iso()
    descricao = motivo or f"Redistribuição para abrigo {abrigo_destino_id}"

    # Decrementa origem e registra movimentação
    registro_saida = {
        "tipo": "redistribuicao_saida",
        "quantidade": quantidade,
        "abrigo_destino": abrigo_destino_id,
        "data": agora,
        "descricao": descricao,
    }

    mantimentos_collection().update_one(
        {"_id": oid},
        {
            "$inc": {"quantidade": -quantidade},
            "$push": {"historico": registro_saida},
        },
    )

    # Cria ou incrementa mantimento no abrigo de destino
    item_nome = doc_origem.get("item", "Item desconhecido")
    categoria = doc_origem.get("categoria")
    unidade = doc_origem.get("unidade")

    registro_entrada = {
        "tipo": "redistribuicao_entrada",
        "quantidade": quantidade,
        "abrigo_origem": doc_origem.get("abrigo_id"),
        "data": agora,
        "descricao": descricao,
    }

    existente_destino = mantimentos_collection().find_one(
        {"item": item_nome, "abrigo_id": abrigo_destino_id}
    )

    if existente_destino:
        # Incrementa estoque existente no destino
        mantimentos_collection().update_one(
            {"_id": existente_destino["_id"]},
            {
                "$inc": {"quantidade": quantidade},
                "$push": {"historico": registro_entrada},
            },
        )
    else:
        # Cria novo registro no destino
        novo_doc = {
            "item": item_nome,
            "quantidade": quantidade,
            "abrigo_id": abrigo_destino_id,
            "data_entrada": agora,
            "historico": [registro_entrada],
        }
        if categoria:
            novo_doc["categoria"] = categoria
        if unidade:
            novo_doc["unidade"] = unidade

        mantimentos_collection().insert_one(novo_doc)

    return buscar_mantimento(mantimento_id)


# ──────────────────────────────────────────────────────────────────
# Abrigos em escassez
# ──────────────────────────────────────────────────────────────────


def listar_abrigos_em_escassez() -> list[dict[str, Any]]:
    """
    Identifica abrigos em situação de escassez, cruzando duas fontes:

    1. Abrigos que possuem `necessidades_urgentes` cadastradas.
    2. Mantimentos cujo estoque está abaixo da `quantidade_minima`.

    Retorna uma lista consolidada com informações de cada abrigo e
    os itens em falta.
    """
    from backend.crud.abrigos import abrigos_collection
    from backend.models.abrigo import abrigo_to_dict

    resultado: list[dict[str, Any]] = []
    abrigos_vistos: set[str] = set()

    # 1. Abrigos com necessidades_urgentes preenchidas
    abrigos_urgentes = abrigos_collection().find(
        {"necessidades_urgentes": {"$exists": True, "$ne": []}}
    )
    for abrigo_doc in abrigos_urgentes:
        abrigo_id = str(abrigo_doc["_id"])
        abrigos_vistos.add(abrigo_id)

        # Busca mantimentos com estoque baixo neste abrigo
        mantimentos_baixos = list(
            mantimentos_collection().find(
                {
                    "abrigo_id": abrigo_id,
                    "$expr": {"$lt": ["$quantidade", "$quantidade_minima"]},
                }
            )
        )

        resultado.append(
            {
                "abrigo": abrigo_to_dict(abrigo_doc),
                "necessidades_urgentes": abrigo_doc.get("necessidades_urgentes", []),
                "mantimentos_em_falta": [
                    mantimento_to_dict(m) for m in mantimentos_baixos
                ],
            }
        )

    # 2. Abrigos com mantimentos abaixo do mínimo (que não foram pegos acima)
    mantimentos_escassos = mantimentos_collection().find(
        {"$expr": {"$lt": ["$quantidade", "$quantidade_minima"]}}
    )
    for mant_doc in mantimentos_escassos:
        abrigo_id = mant_doc.get("abrigo_id")
        if not abrigo_id or abrigo_id in abrigos_vistos:
            continue

        abrigos_vistos.add(abrigo_id)
        try:
            abrigo_info = buscar_abrigo(abrigo_id)
        except AbrigoNaoEncontrado:
            continue

        # Busca todos os mantimentos baixos deste abrigo
        todos_baixos = list(
            mantimentos_collection().find(
                {
                    "abrigo_id": abrigo_id,
                    "$expr": {"$lt": ["$quantidade", "$quantidade_minima"]},
                }
            )
        )

        resultado.append(
            {
                "abrigo": abrigo_info,
                "necessidades_urgentes": abrigo_info.get(
                    "necessidades_urgentes", []
                ),
                "mantimentos_em_falta": [
                    mantimento_to_dict(m) for m in todos_baixos
                ],
            }
        )

    return resultado
