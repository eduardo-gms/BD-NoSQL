from typing import Any

from bson import ObjectId
from bson.errors import InvalidId

from backend.db import get_collection

def pessoas_collection():
    return get_collection("pessoas_resgatadas")

def abrigos_collection():
    return get_collection("abrigos")

def doacoes_collection():
    return get_collection("doacoes")


def mantimentos_collection():
    return get_collection("mantimentos")


def relatorio_necessidades_medicas() -> list[dict[str, Any]]:
    """
    Agrupa pessoas que necessitam de medicação contínua, cruzando com os abrigos onde se encontram.
    """
    pipeline = [
        # Filtra apenas quem tem medicação contínua
        {"$match": {"condicoes_saude.medicacao_continua": {"$exists": True, "$ne": []}}},
        
        # Cria um documento para cada medicamento na lista
        {"$unwind": "$condicoes_saude.medicacao_continua"},
        
        # Agrupa por abrigo e medicamento, somando a quantidade
        {"$group": {
            "_id": {
                "abrigo": "$abrigo_atual",
                "medicamento": "$condicoes_saude.medicacao_continua"
            },
            "quantidade_pessoas": {"$sum": 1}
        }},
        
        # Ordena para mostrar as maiores necessidades primeiro
        {"$sort": {"quantidade_pessoas": -1}},
        
        # Resolve o nome do abrigo quando o id existir
        {"$addFields": {
            "abrigo_oid": {
                "$convert": {
                    "input": "$_id.abrigo",
                    "to": "objectId",
                    "onError": None,
                    "onNull": None,
                }
            }
        }},
        {"$lookup": {
            "from": "abrigos",
            "localField": "abrigo_oid",
            "foreignField": "_id",
            "as": "abrigo_doc",
        }},
        {"$project": {
            "_id": 0,
            "abrigo": {
                "$ifNull": [
                    {"$arrayElemAt": ["$abrigo_doc.nome", 0]},
                    {"$ifNull": ["$_id.abrigo", "Sem abrigo vinculado"]},
                ]
            },
            "medicamento": "$_id.medicamento",
            "quantidade_pessoas": 1,
        }},
    ]

    return list(pessoas_collection().aggregate(pipeline))


def relatorio_escassez_suprimentos() -> list[dict[str, Any]]:
    """
    Cruza as 'necessidades_urgentes' dos abrigos para identificar quais são os itens mais solicitados.
    Inclui a lista de nomes dos abrigos que pediram cada item.
    """
    pipeline = [
        {"$match": {"necessidades_urgentes": {"$exists": True, "$ne": []}}},
        {"$unwind": "$necessidades_urgentes"},
        {"$group": {
            "_id": "$necessidades_urgentes",
            "abrigos_solicitantes": {"$sum": 1},
            "abrigos": {"$push": {
                "id": {"$toString": "$_id"},
                "nome": "$nome",
            }},
        }},
        {"$sort": {"abrigos_solicitantes": -1}},
        {"$project": {
            "_id": 0,
            "item_necessario": "$_id",
            "abrigos_solicitantes": 1,
            "abrigos": 1,
        }},
    ]

    return list(abrigos_collection().aggregate(pipeline))


def relatorio_ocupacao_abrigos() -> list[dict[str, Any]]:
    """
    Calcula a taxa de ocupação dos abrigos e lista os mais críticos (taxa >= 90% ou Superlotados).

    Usa capacidade_maxima quando existir; senão, capacidade_estimada (mesma lógica do painel).
    """
    pipeline = [
        # Precisa ter ocupação e alguma capacidade informada
        {"$match": {
            "ocupacao_atual": {"$exists": True, "$ne": None},
            "$or": [
                {"capacidade_maxima": {"$exists": True, "$ne": None, "$gt": 0}},
                {"capacidade_estimada": {"$exists": True, "$ne": None, "$gt": 0}},
            ],
        }},

        # Capacidade efetiva: oficial ou estimada
        {"$addFields": {
            "capacidade_efetiva": {
                "$ifNull": ["$capacidade_maxima", "$capacidade_estimada"]
            }
        }},

        # Taxa de ocupação (%)
        {"$addFields": {
            "taxa_ocupacao_percentual": {
                "$multiply": [
                    {"$divide": ["$ocupacao_atual", "$capacidade_efetiva"]},
                    100,
                ]
            }
        }},

        # Críticos: ocupação alta OU status Superlotado / lotado
        {"$match": {
            "$or": [
                {"taxa_ocupacao_percentual": {"$gte": 90}},
                {"status": {"$regex": "^superlotado$", "$options": "i"}},
                {"status": {"$regex": "^lotado$", "$options": "i"}},
            ]
        }},

        {"$sort": {"taxa_ocupacao_percentual": -1}},

        {"$project": {
            "_id": 0,
            "nome": 1,
            "taxa_ocupacao_percentual": {"$round": ["$taxa_ocupacao_percentual", 2]},
            "ocupacao_atual": 1,
            "capacidade_maxima": "$capacidade_efetiva",
            "status": 1,
        }},
    ]

    return list(abrigos_collection().aggregate(pipeline))


def relatorio_triagem_cadastros() -> list[dict[str, Any]]:
    """
    Usa $facet para rodar múltiplas agregações de qualidade de dados de uma só vez.
    """
    pipeline = [
        {"$facet": {
            "sem_nome_completo": [
                {"$match": {"nome_completo": {"$exists": False}}},
                {"$count": "total"}
            ],
            "sem_contato_emergencia": [
                {"$match": {
                    "$or": [
                        {"contatos_emergencia": {"$exists": False}},
                        {"contatos_emergencia": {"$size": 0}}
                    ]
                }},
                {"$count": "total"}
            ],
            "total_resgatados": [
                {"$count": "total"}
            ]
        }},
        # Formata o resultado para não vir como listas de objetos com 'total'
        {"$project": {
            "sem_nome_completo": {"$arrayElemAt": ["$sem_nome_completo.total", 0]},
            "sem_contato_emergencia": {"$arrayElemAt": ["$sem_contato_emergencia.total", 0]},
            "total_resgatados": {"$arrayElemAt": ["$total_resgatados.total", 0]}
        }}
    ]
    
    result = list(pessoas_collection().aggregate(pipeline))
    return result[0] if result else {}


def relatorio_resumo() -> dict[str, Any]:
    """
    Totais operacionais para o painel de Relatórios (tudo via /relatorios).
    Contagens feitas no MongoDB, sem depender das rotas de cadastro.
    """
    pessoas = pessoas_collection()
    abrigos = abrigos_collection()
    doacoes = doacoes_collection()
    mantimentos = mantimentos_collection()

    pessoas_resgatadas = pessoas.count_documents({})
    sem_abrigo = pessoas.count_documents({
        "$or": [
            {"abrigo_atual": {"$exists": False}},
            {"abrigo_atual": None},
            {"abrigo_atual": ""},
        ]
    })
    total_abrigos = abrigos.count_documents({})
    total_doacoes = doacoes.count_documents({})
    itens_estoque = mantimentos.count_documents({})
    estoque_baixo = mantimentos.count_documents({
        "quantidade_minima": {"$exists": True, "$ne": None},
        "$expr": {"$lt": ["$quantidade", "$quantidade_minima"]},
    })

    ids_urgentes = {
        str(doc["_id"])
        for doc in abrigos.find(
            {"necessidades_urgentes": {"$exists": True, "$ne": []}},
            {"_id": 1},
        )
    }
    ids_estoque_baixo = {
        str(doc["abrigo_id"])
        for doc in mantimentos.find(
            {
                "abrigo_id": {"$exists": True, "$ne": None},
                "quantidade_minima": {"$exists": True, "$ne": None},
                "$expr": {"$lt": ["$quantidade", "$quantidade_minima"]},
            },
            {"abrigo_id": 1},
        )
        if doc.get("abrigo_id")
    }

    return {
        "pessoas_resgatadas": pessoas_resgatadas,
        "sem_abrigo": sem_abrigo,
        "abrigos": total_abrigos,
        "doacoes": total_doacoes,
        "itens_estoque": itens_estoque,
        "estoque_baixo": estoque_baixo,
        "abrigos_escassez": len(ids_urgentes | ids_estoque_baixo),
    }


def relatorio_pessoas_sem_abrigo() -> list[dict[str, Any]]:
    """Lista resgatados ainda sem abrigo vinculado."""
    pipeline = [
        {"$match": {
            "$or": [
                {"abrigo_atual": {"$exists": False}},
                {"abrigo_atual": None},
                {"abrigo_atual": ""},
            ]
        }},
        {"$project": {
            "_id": 0,
            "id": {"$toString": "$_id"},
            "nome": {
                "$ifNull": [
                    "$nome_completo",
                    {"$ifNull": ["$nome_conhecido", {"$ifNull": ["$nome", "Sem identificação"]}]},
                ]
            },
            "local_resgate": 1,
            "data_resgate": 1,
            "tipo_identificacao": {
                "$cond": [
                    {"$ifNull": ["$nome_completo", False]},
                    "nome completo",
                    {"$cond": [
                        {"$ifNull": ["$nome_conhecido", False]},
                        "nome conhecido",
                        "incompleto",
                    ]},
                ]
            },
        }},
        {"$sort": {"nome": 1}},
    ]
    return list(pessoas_collection().aggregate(pipeline))


def relatorio_estoque_baixo() -> list[dict[str, Any]]:
    """Itens de estoque abaixo da quantidade mínima, com nome do abrigo."""
    pipeline = [
        {"$match": {
            "quantidade_minima": {"$exists": True, "$ne": None},
            "$expr": {"$lt": ["$quantidade", "$quantidade_minima"]},
        }},
        {"$addFields": {
            "abrigo_oid": {
                "$convert": {
                    "input": "$abrigo_id",
                    "to": "objectId",
                    "onError": None,
                    "onNull": None,
                }
            }
        }},
        {"$lookup": {
            "from": "abrigos",
            "localField": "abrigo_oid",
            "foreignField": "_id",
            "as": "abrigo_doc",
        }},
        {"$project": {
            "_id": 0,
            "id": {"$toString": "$_id"},
            "item": 1,
            "quantidade": 1,
            "quantidade_minima": 1,
            "unidade": 1,
            "abrigo": {
                "$ifNull": [
                    {"$arrayElemAt": ["$abrigo_doc.nome", 0]},
                    "Abrigo não identificado",
                ]
            },
        }},
        {"$sort": {"quantidade": 1}},
    ]
    return list(mantimentos_collection().aggregate(pipeline))


def relatorio_abrigos_escassez() -> list[dict[str, Any]]:
    """
    Abrigos com necessidades urgentes e/ou mantimentos abaixo do mínimo.

    Para pedidos urgentes sem estoque local, a quantidade necessária é estimada
    pela maior quantidade_minima desse item em outros abrigos.
    """
    mantimentos = mantimentos_collection()
    abrigos = abrigos_collection()

    # Referência de mínimo/unidade por nome do item (em todo o estoque)
    ref_por_item: dict[str, dict[str, Any]] = {}
    # Estoque completo por abrigo (para achar qtd atual de um pedido urgente)
    estoque_local: dict[str, dict[str, dict[str, Any]]] = {}

    for m in mantimentos.find({}, {
        "abrigo_id": 1, "item": 1, "quantidade": 1, "quantidade_minima": 1, "unidade": 1,
    }):
        item = m.get("item")
        if not item:
            continue
        key = item.casefold()
        qmin = m.get("quantidade_minima")
        if qmin is not None:
            prev = ref_por_item.get(key)
            if not prev or qmin > prev["quantidade_minima"]:
                ref_por_item[key] = {
                    "quantidade_minima": qmin,
                    "unidade": m.get("unidade"),
                }
        aid = str(m.get("abrigo_id") or "")
        if aid:
            estoque_local.setdefault(aid, {})[key] = m

    # Itens abaixo do mínimo por abrigo
    estoque_baixo: dict[str, list[dict[str, Any]]] = {}
    for aid, itens in estoque_local.items():
        for m in itens.values():
            qmin = m.get("quantidade_minima")
            qtd = m.get("quantidade")
            if qmin is None or qtd is None or qtd >= qmin:
                continue
            estoque_baixo.setdefault(aid, []).append({
                "item": m.get("item"),
                "quantidade": qtd,
                "quantidade_minima": qmin,
                "unidade": m.get("unidade"),
                "urgente": False,
            })

    def montar_itens(aid: str, necessidades: list[str]) -> list[dict[str, Any]]:
        baixos = list(estoque_baixo.get(aid, []))
        nomes_baixo = { (i.get("item") or "").casefold() for i in baixos }
        # Marca em vermelho só se ainda está abaixo do mínimo e foi pedido com urgência
        pedidos = { (n or "").casefold() for n in necessidades }
        for i in baixos:
            if (i.get("item") or "").casefold() in pedidos:
                i["urgente"] = True
        for nome in necessidades:
            key = (nome or "").casefold()
            if not key or key in nomes_baixo:
                continue
            local = estoque_local.get(aid, {}).get(key)
            ref = ref_por_item.get(key) or {}
            qmin = (
                local.get("quantidade_minima")
                if local and local.get("quantidade_minima") is not None
                else ref.get("quantidade_minima")
            )
            if qmin is None:
                qmin = 20  # fallback quando o item ainda não existe no estoque
            qtd = local.get("quantidade", 0) if local else 0
            # Já tem o suficiente: não entra em "itens em falta"
            if qtd >= qmin:
                continue
            baixos.append({
                "item": nome,
                "quantidade": qtd,
                "quantidade_minima": qmin,
                "unidade": (local or ref).get("unidade"),
                "urgente": True,
            })
        return baixos

    resultado: list[dict[str, Any]] = []
    vistos: set[str] = set()

    for doc in abrigos.find({"necessidades_urgentes": {"$exists": True, "$ne": []}}):
        aid = str(doc["_id"])
        vistos.add(aid)
        necessidades = doc.get("necessidades_urgentes") or []
        itens = montar_itens(aid, necessidades)
        if not itens:
            continue
        resultado.append({
            "id": aid,
            "nome": doc.get("nome"),
            "status": doc.get("status"),
            "necessidades_urgentes": necessidades,
            "itens_estoque_baixo": itens,
        })

    for aid, itens_baixo in estoque_baixo.items():
        if aid in vistos:
            continue
        try:
            doc = abrigos.find_one({"_id": ObjectId(aid)})
        except InvalidId:
            doc = None
        if not doc:
            continue
        necessidades = doc.get("necessidades_urgentes") or []
        itens = montar_itens(aid, necessidades)
        if not itens:
            continue
        resultado.append({
            "id": aid,
            "nome": doc.get("nome"),
            "status": doc.get("status"),
            "necessidades_urgentes": necessidades,
            "itens_estoque_baixo": itens,
        })

    resultado.sort(key=lambda a: a.get("nome") or "")
    return resultado

