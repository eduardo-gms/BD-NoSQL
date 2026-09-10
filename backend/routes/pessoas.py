from typing import Optional
from fastapi import APIRouter, HTTPException, Body

from backend.models.pessoa import PessoaCreate, VincularAbrigoRequest
from backend.crud import pessoas as crud
from backend.crud.abrigos import AbrigoNaoEncontrado

router = APIRouter(prefix="/pessoas", tags=["Pessoas"])


@router.post("/", status_code=201)
def cadastrar_pessoa(pessoa: PessoaCreate):
    """Cadastra uma nova pessoa resgatada. Aceita campos extras livremente."""
    try:
        return crud.cadastrar_pessoa(pessoa)
    except AbrigoNaoEncontrado:
        raise HTTPException(404, "Abrigo informado não existe.")
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.get("/{pessoa_id}")
def buscar_pessoa(pessoa_id: str):
    try:
        return crud.buscar_pessoa(pessoa_id)
    except crud.PessoaNaoEncontrada:
        raise HTTPException(404, "Pessoa não encontrada.")


@router.get("/")
def listar_pessoas(abrigo_atual: Optional[str] = None):
    return crud.listar_pessoas(abrigo_atual)


@router.patch("/{pessoa_id}")
def atualizar_pessoa(pessoa_id: str, dados: dict = Body(...)):
    """Atualização parcial e schema-less de qualquer campo da pessoa."""
    try:
        return crud.atualizar_pessoa(pessoa_id, dados)
    except crud.PessoaNaoEncontrada:
        raise HTTPException(404, "Pessoa não encontrada.")


@router.patch("/{pessoa_id}/vincular-abrigo")
def vincular_abrigo(pessoa_id: str, req: VincularAbrigoRequest):
    """Vincula (ou transfere) a pessoa a um abrigo."""
    try:
        return crud.vincular_pessoa_abrigo(pessoa_id, req.abrigo_atual)
    except crud.PessoaNaoEncontrada:
        raise HTTPException(404, "Pessoa não encontrada.")
    except AbrigoNaoEncontrado:
        raise HTTPException(404, "Abrigo não encontrado.")


@router.delete("/{pessoa_id}/vincular-abrigo")
def desvincular_abrigo(pessoa_id: str):
    """Remove o vínculo da pessoa com o abrigo atual."""
    try:
        return crud.desvincular_pessoa(pessoa_id)
    except crud.PessoaNaoEncontrada:
        raise HTTPException(404, "Pessoa não encontrada.")