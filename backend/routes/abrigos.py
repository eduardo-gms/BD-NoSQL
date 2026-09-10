from fastapi import APIRouter, HTTPException

from backend.models.abrigo import AbrigoStatusUpdate
from backend.crud import abrigos as crud

router = APIRouter(prefix="/abrigos", tags=["Abrigos"])


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