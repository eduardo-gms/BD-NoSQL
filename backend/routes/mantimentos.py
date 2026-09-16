"""
Rotas da API — Mantimentos (controle de estoque de suprimentos).
"""

from typing import Optional
from fastapi import APIRouter, HTTPException

from backend.models.mantimento import (
    MantimentoCreate,
    MantimentoSaidaRequest,
    AssociarAbrigoRequest,
)
from backend.crud import mantimentos as crud
from backend.crud.abrigos import AbrigoNaoEncontrado

router = APIRouter(prefix="/mantimentos", tags=["Mantimentos"])


# ── A rota fixa /abrigos-escassez DEVE vir ANTES de /{mantimento_id}
#    para que o FastAPI não interprete "abrigos-escassez" como um ID.


@router.get("/abrigos-escassez")
def listar_abrigos_em_escassez():
    """
    Retorna abrigos em situação de escassez, consolidando:

    - Abrigos com `necessidades_urgentes` cadastradas.
    - Abrigos com mantimentos cujo estoque está abaixo da `quantidade_minima`.
    """
    return crud.listar_abrigos_em_escassez()


@router.post("/", status_code=201)
def dar_entrada_mantimento(mantimento: MantimentoCreate):
    """
    Dá entrada em um novo suprimento vinculado a um abrigo.

    Campos obrigatórios: `item`, `quantidade`, `abrigo_id`.
    Aceita campos extras livremente (schema-less).
    """
    try:
        dados = mantimento.model_dump(exclude_none=True)
        return crud.dar_entrada_mantimento(dados)
    except AbrigoNaoEncontrado:
        raise HTTPException(404, "Abrigo informado não existe.")
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.get("/")
def listar_mantimentos(
    abrigo_id: Optional[str] = None,
    item: Optional[str] = None,
    estoque_baixo: bool = False,
):
    """
    Lista mantimentos com filtros opcionais.

    - **abrigo_id**: filtra por abrigo
    - **item**: busca parcial no nome do item
    - **estoque_baixo**: se `true`, retorna apenas itens abaixo da quantidade mínima
    """
    return crud.listar_mantimentos(
        abrigo_id=abrigo_id, item=item, estoque_baixo=estoque_baixo
    )


@router.get("/{mantimento_id}")
def buscar_mantimento(mantimento_id: str):
    """Busca um mantimento pelo ID."""
    try:
        return crud.buscar_mantimento(mantimento_id)
    except crud.MantimentoNaoEncontrado:
        raise HTTPException(404, "Mantimento não encontrado.")


@router.patch("/{mantimento_id}/saida")
def registrar_saida(mantimento_id: str, req: MantimentoSaidaRequest):
    """
    Registra saída/consumo de um suprimento do estoque.

    Decrementa a quantidade e registra a movimentação no histórico.
    Não permite que o estoque fique negativo.
    """
    try:
        return crud.registrar_saida(mantimento_id, req.quantidade, req.motivo)
    except crud.MantimentoNaoEncontrado:
        raise HTTPException(404, "Mantimento não encontrado.")
    except crud.EstoqueInsuficiente as e:
        raise HTTPException(409, str(e))


@router.patch("/{mantimento_id}/associar-abrigo")
def associar_abrigo(mantimento_id: str, req: AssociarAbrigoRequest):
    """
    Redistribui mantimento para um abrigo em situação de escassez.

    Decrementa o estoque de origem e cria (ou incrementa) o registro
    no abrigo de destino. Registra a movimentação no histórico de ambos.
    """
    try:
        return crud.associar_abrigo_escassez(
            mantimento_id, req.abrigo_destino_id, req.quantidade, req.motivo
        )
    except crud.MantimentoNaoEncontrado:
        raise HTTPException(404, "Mantimento não encontrado.")
    except AbrigoNaoEncontrado:
        raise HTTPException(404, "Abrigo de destino não encontrado.")
    except crud.EstoqueInsuficiente as e:
        raise HTTPException(409, str(e))
