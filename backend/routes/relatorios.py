from fastapi import APIRouter
from backend.crud import relatorios as crud

router = APIRouter(prefix="/relatorios", tags=["Relatórios (Analytics)"])


@router.get("/resumo")
def relatorio_resumo():
    """
    Totais da operação (pessoas, abrigos, doações, estoque, escassez)
    para a tela de Relatórios — tudo calculado no banco.
    """
    return crud.relatorio_resumo()


@router.get("/necessidades-medicas")
def relatorio_necessidades_medicas():
    """
    Retorna a contagem de pessoas que necessitam de medicação contínua, agrupadas por abrigo e por medicamento.
    Útil para direcionar as doações farmacêuticas para o lugar certo.
    """
    return crud.relatorio_necessidades_medicas()


@router.get("/escassez-suprimentos")
def relatorio_escassez_suprimentos():
    """
    Agrupa as necessidades mais urgentes declaradas pelos abrigos e conta a frequência de cada item,
    ajudando a identificar quais doações devem ser priorizadas.
    """
    return crud.relatorio_escassez_suprimentos()


@router.get("/ocupacao-abrigos")
def relatorio_ocupacao_abrigos():
    """
    Calcula a porcentagem de ocupação e lista apenas os abrigos em estado crítico (ocupação > 90% ou 'Superlotado').
    """
    return crud.relatorio_ocupacao_abrigos()


@router.get("/triagem-cadastros")
def relatorio_triagem_cadastros():
    """
    Levantamento de qualidade de dados (Schema-less).
    Mostra quantos resgatados estão sem nome completo ou sem contato de emergência.
    """
    return crud.relatorio_triagem_cadastros()


@router.get("/pessoas-sem-abrigo")
def relatorio_pessoas_sem_abrigo():
    """Lista pessoas resgatadas que ainda não foram vinculadas a um abrigo."""
    return crud.relatorio_pessoas_sem_abrigo()


@router.get("/estoque-baixo")
def relatorio_estoque_baixo():
    """Lista mantimentos com quantidade abaixo do mínimo cadastrado."""
    return crud.relatorio_estoque_baixo()


@router.get("/abrigos-escassez")
def relatorio_abrigos_escassez():
    """Lista abrigos com necessidades urgentes e/ou estoque abaixo do mínimo."""
    return crud.relatorio_abrigos_escassez()

