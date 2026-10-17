"""
Rotas da API — Doações.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Body

from backend.models.doacao import DoacaoCreate, DestinarDoacaoRequest
from backend.crud.abrigos import AbrigoNaoEncontrado
from backend.crud import doacoes as crud

router = APIRouter(prefix="/doacoes", tags=["Doações"])


@router.post("/", status_code=201)
def registrar_doacao(doacao: DoacaoCreate):
    """
    Registra uma nova doação no sistema.

    Aceita campos extras livremente (schema-less). O único campo
    obrigatório é `item`.
    """
    try:
        return crud.registrar_doacao(doacao)
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.get("/")
def listar_doacoes(
    categoria: Optional[str] = None,
    item: Optional[str] = None,
    doador: Optional[str] = None,
):
    """
    Lista doações com filtros opcionais.

    - **categoria**: filtra por categoria exata (ex: "Medicamentos")
    - **item**: busca parcial no nome do item
    - **doador**: busca parcial no nome do doador
    """
    return crud.listar_doacoes(categoria=categoria, item=item, doador=doador)


@router.get("/{doacao_id}")
def buscar_doacao(doacao_id: str):
    """Busca uma doação pelo ID."""
    try:
        return crud.buscar_doacao(doacao_id)
    except crud.DoacaoNaoEncontrada:
        raise HTTPException(404, "Doação não encontrada.")


@router.patch("/{doacao_id}")
def atualizar_doacao(doacao_id: str, dados: dict = Body(...)):
    """Atualização parcial e schema-less de qualquer campo da doação."""
    try:
        return crud.atualizar_doacao(doacao_id, dados)
    except crud.DoacaoNaoEncontrada:
        raise HTTPException(404, "Doação não encontrada.")


@router.patch("/{doacao_id}/destinar")
def destinar_doacao(doacao_id: str, req: DestinarDoacaoRequest):
    """
    Envia a doação para o estoque de um abrigo.

    Cria o item nos mantimentos do abrigo (ou soma, se ele já existir),
    registra a entrada no histórico e marca a doação com `destinacao`.
    Uma doação só pode ser destinada uma vez.
    """
    try:
        return crud.destinar_doacao(doacao_id, req.abrigo_id, req.quantidade)
    except crud.DoacaoNaoEncontrada:
        raise HTTPException(404, "Doação não encontrada.")
    except AbrigoNaoEncontrado:
        raise HTTPException(404, "Abrigo não encontrado.")
    except crud.DoacaoJaDestinada as e:
        raise HTTPException(409, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.delete("/{doacao_id}")
def deletar_doacao(doacao_id: str):
    """Remove uma doação do sistema."""
    try:
        return crud.deletar_doacao(doacao_id)
    except crud.DoacaoNaoEncontrada:
        raise HTTPException(404, "Doação não encontrada.")
