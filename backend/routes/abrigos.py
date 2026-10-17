from typing import Optional
from fastapi import APIRouter, HTTPException

from backend.models.abrigo import AbrigoCreate, AbrigoStatusUpdate, AbrigoUpdate
from backend.crud import abrigos as crud

router = APIRouter(prefix="/abrigos", tags=["Abrigos"])


@router.post("/", status_code=201)
def criar_abrigo(abrigo: AbrigoCreate):
    """Cadastra um abrigo. Só `nome` é obrigatório; a ocupação começa em 0."""
    return crud.criar_abrigo(abrigo.model_dump(exclude_none=True))


@router.get("/")
def listar_abrigos(status: Optional[str] = None):
    """Lista todos os abrigos (usado pela interface visual). Filtro opcional por status."""
    return crud.listar_abrigos(status)


@router.get("/{abrigo_id}")
def buscar_abrigo(abrigo_id: str):
    try:
        return crud.buscar_abrigo(abrigo_id)
    except crud.AbrigoNaoEncontrado:
        raise HTTPException(404, "Abrigo não encontrado.")


@router.patch("/{abrigo_id}/status")
def atualizar_status(abrigo_id: str, dados: AbrigoStatusUpdate):
    """
    Atualiza status (ex: 'aberto', 'lotado', 'fechado') e/ou a
    capacidade_maxima do abrigo. Aceita campos extras (schema-less).
    """
    try:
        return crud.atualizar_status_abrigo(abrigo_id, dados.model_dump(exclude_unset=True))
    except crud.AbrigoNaoEncontrado:
        raise HTTPException(404, "Abrigo não encontrado.")


@router.patch("/{abrigo_id}")
def atualizar_abrigo(abrigo_id: str, dados: AbrigoUpdate):
    """
    Edita qualquer campo do abrigo. Enviar um campo com `null` remove
    esse campo do documento. A ocupação não pode ser alterada aqui.
    """
    try:
        return crud.atualizar_abrigo(abrigo_id, dados.model_dump(exclude_unset=True))
    except crud.AbrigoNaoEncontrado:
        raise HTTPException(404, "Abrigo não encontrado.")


@router.delete("/{abrigo_id}")
def excluir_abrigo(abrigo_id: str):
    """
    Exclui o abrigo. Retorna **409** se ainda houver pessoas vinculadas
    ou mantimentos no estoque dele.
    """
    try:
        return crud.excluir_abrigo(abrigo_id)
    except crud.AbrigoNaoEncontrado:
        raise HTTPException(404, "Abrigo não encontrado.")
    except crud.AbrigoEmUso as e:
        raise HTTPException(409, str(e))
