"""
CRUD de Pessoas Resgatadas — cadastro, atualização e vínculo com abrigo.
"""

from typing import Any, Callable, Optional
from bson import ObjectId
from bson.errors import InvalidId
from pymongo.client_session import ClientSession
from pymongo.read_concern import ReadConcern
from pymongo.read_preferences import ReadPreference
from pymongo.write_concern import WriteConcern

from backend.db import get_collection
from backend.models.pessoa import PessoaCreate, pessoa_to_dict
from backend.crud.abrigos import reservar_vaga, liberar_vaga, AbrigoNaoEncontrado


def pessoas_collection():
    return get_collection("pessoas_resgatadas")


def _sem_campos_protegidos(dados: dict[str, Any], *, criacao: bool = False) -> dict[str, Any]:
    protegidos = {"id", "_id"} if criacao else {"id", "_id", "abrigo_atual"}
    return {k: v for k, v in dados.items() if k.split(".", 1)[0] not in protegidos}


class PessoaNaoEncontrada(Exception):
    pass


def _oid(pessoa_id: str) -> ObjectId:
    try:
        return ObjectId(pessoa_id)
    except InvalidId:
        raise PessoaNaoEncontrada(f"id inválido: {pessoa_id}")


def _em_transacao(operacao: Callable[[ClientSession], dict[str, Any]]) -> dict[str, Any]:
    """O driver repete a transação em conflitos transitórios e confirma uma vez."""
    cliente = pessoas_collection().database.client
    with cliente.start_session() as session:
        return session.with_transaction(
            operacao,
            read_concern=ReadConcern("snapshot"),
            write_concern=WriteConcern("majority"),
            read_preference=ReadPreference.PRIMARY,
        )


def cadastrar_pessoa(dados: PessoaCreate) -> dict[str, Any]:
    """Salva a pessoa e, havendo vínculo, incrementa a ocupação atomicamente."""
    def inserir(session: Optional[ClientSession] = None) -> dict[str, Any]:
        # Reconstruir a cada tentativa: insert_one pode adicionar _id ao dict.
        doc = _sem_campos_protegidos(dados.model_dump(exclude_none=True), criacao=True)
        abrigo_atual = doc.pop("abrigo_atual", None)
        if abrigo_atual:
            reservar_vaga(abrigo_atual, session=session)
            doc["abrigo_atual"] = abrigo_atual
        resultado = pessoas_collection().insert_one(doc, session=session)
        return buscar_pessoa(str(resultado.inserted_id), session=session)

    if dados.abrigo_atual:
        return _em_transacao(inserir)
    return inserir()


def buscar_pessoa(pessoa_id: str, *, session: Optional[ClientSession] = None) -> dict[str, Any]:
    doc = pessoas_collection().find_one({"_id": _oid(pessoa_id)}, session=session)
    if not doc:
        raise PessoaNaoEncontrada(pessoa_id)
    return pessoa_to_dict(doc)


def listar_pessoas(abrigo_atual: Optional[str] = None) -> list[dict[str, Any]]:
    if abrigo_atual == "null":
        filtro = {"abrigo_atual": {"$in": [None, ""]}}
    elif abrigo_atual:
        filtro = {"abrigo_atual": abrigo_atual}
    else:
        filtro = {} # Retorna todo mundo se não passar filtro nenhum
        
    return [pessoa_to_dict(doc) for doc in pessoas_collection().find(filtro)]


def atualizar_pessoa(pessoa_id: str, dados: dict[str, Any]) -> dict[str, Any]:
    """
    Atualização parcial e schema-less — qualquer campo pode ser enviado.
    Campos enviados como null são removidos do documento. O abrigo não muda
    por aqui (use as rotas de vínculo, que ajustam a ocupação).
    """
    atual = buscar_pessoa(pessoa_id)  # levanta PessoaNaoEncontrada
    dados = _sem_campos_protegidos(dados)
    definir = {k: v for k, v in dados.items() if v is not None}
    remover = {k: "" for k, v in dados.items() if v is None}

    # mesma regra do cadastro: precisa continuar com algum nome ou foto
    resultado = {**{k: v for k, v in atual.items() if k not in remover}, **definir}
    if not any(
        isinstance(resultado.get(k), str) and resultado[k].strip()
        for k in ("nome", "nome_conhecido", "nome_completo", "foto")
    ):
        raise ValueError("A pessoa precisa continuar com algum nome ou foto.")

    operacao: dict[str, Any] = {}
    if definir:
        operacao["$set"] = definir
    if remover:
        operacao["$unset"] = remover
    if operacao:
        pessoas_collection().update_one({"_id": _oid(pessoa_id)}, operacao)
    return buscar_pessoa(pessoa_id)


def vincular_pessoa_abrigo(pessoa_id: str, abrigo_atual: str) -> dict[str, Any]:
    """Transfere o vínculo e ajusta as duas ocupações na mesma transação."""
    def vincular(session: ClientSession) -> dict[str, Any]:
        # A leitura também fica dentro da tentativa para não reutilizar vínculo antigo.
        pessoa = buscar_pessoa(pessoa_id, session=session)
        abrigo_anterior = pessoa.get("abrigo_atual")
        if abrigo_anterior == abrigo_atual:
            return pessoa

        reservar_vaga(abrigo_atual, session=session)
        if abrigo_anterior:
            try:
                liberar_vaga(abrigo_anterior, session=session)
            except AbrigoNaoEncontrado:
                pass  # preserva recuperação de referência antiga inexistente

        pessoas_collection().update_one(
            {"_id": _oid(pessoa_id)}, {"$set": {"abrigo_atual": abrigo_atual}},
            session=session,
        )
        return buscar_pessoa(pessoa_id, session=session)

    return _em_transacao(vincular)


def desvincular_pessoa(pessoa_id: str) -> dict[str, Any]:
    """Remove o vínculo e libera a vaga juntos, ou desfaz ambos em caso de erro."""
    def desvincular(session: ClientSession) -> dict[str, Any]:
        pessoa = buscar_pessoa(pessoa_id, session=session)
        abrigo_atual = pessoa.get("abrigo_atual")
        if abrigo_atual:
            try:
                liberar_vaga(abrigo_atual, session=session)
            except AbrigoNaoEncontrado:
                pass
            pessoas_collection().update_one(
                {"_id": _oid(pessoa_id)}, {"$unset": {"abrigo_atual": ""}},
                session=session,
            )
        return buscar_pessoa(pessoa_id, session=session)

    return _em_transacao(desvincular)
