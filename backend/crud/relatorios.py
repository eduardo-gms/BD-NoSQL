from typing import Any
from backend.db import get_collection

def pessoas_collection():
    return get_collection("pessoas_resgatadas")

def abrigos_collection():
    return get_collection("abrigos")

def doacoes_collection():
    return get_collection("doacoes")


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
        
        # Opcional: formata a saída para ficar mais limpa
        {"$project": {
            "_id": 0,
            "abrigo": {"$ifNull": ["$_id.abrigo", "Sem abrigo vinculado"]},
            "medicamento": "$_id.medicamento",
            "quantidade_pessoas": 1
        }}
    ]
    
    return list(pessoas_collection().aggregate(pipeline))


def relatorio_escassez_suprimentos() -> list[dict[str, Any]]:
    """
    Cruza as 'necessidades_urgentes' dos abrigos para identificar quais são os itens mais solicitados.
    """
    pipeline = [
        # Filtra abrigos que declararam necessidades urgentes
        {"$match": {"necessidades_urgentes": {"$exists": True, "$ne": []}}},
        
        # Desmembra a lista de necessidades
        {"$unwind": "$necessidades_urgentes"},
        
        # Agrupa pela necessidade e conta quantos abrigos pediram
        {"$group": {
            "_id": "$necessidades_urgentes",
            "abrigos_solicitantes": {"$sum": 1}
        }},
        
        # Ordena da maior demanda para a menor
        {"$sort": {"abrigos_solicitantes": -1}},
        
        # Formatação
        {"$project": {
            "_id": 0,
            "item_necessario": "$_id",
            "abrigos_solicitantes": 1
        }}
    ]
    
    return list(abrigos_collection().aggregate(pipeline))


def relatorio_ocupacao_abrigos() -> list[dict[str, Any]]:
    """
    Calcula a taxa de ocupação dos abrigos e lista os mais críticos (taxa > 90% ou Superlotados).
    """
    pipeline = [
        # Filtra abrigos que tem capacidade máxima e ocupação atual
        {"$match": {
            "capacidade_maxima": {"$exists": True},
            "ocupacao_atual": {"$exists": True}
        }},
        
        # Calcula a taxa de ocupação
        {"$addFields": {
            "taxa_ocupacao_percentual": {
                "$multiply": [
                    {"$divide": ["$ocupacao_atual", "$capacidade_maxima"]}, 
                    100
                ]
            }
        }},
        
        # Traz abrigos com mais de 90% de ocupação OU que estejam marcados como 'Superlotado'
        {"$match": {
            "$or": [
                {"taxa_ocupacao_percentual": {"$gte": 90}},
                {"status": "Superlotado"}
            ]
        }},
        
        # Ordena pelos mais lotados primeiro
        {"$sort": {"taxa_ocupacao_percentual": -1}},
        
        # Deixa apenas os campos essenciais no retorno
        {"$project": {
            "_id": 0,
            "nome": 1,
            "taxa_ocupacao_percentual": {"$round": ["$taxa_ocupacao_percentual", 2]},
            "ocupacao_atual": 1,
            "capacidade_maxima": 1,
            "status": 1
        }}
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

