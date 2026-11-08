"""Validação de nomes de campos usada somente por pessoas e abrigos."""

from typing import Any

from pydantic import BaseModel, model_validator


def validar_chaves(valor: Any) -> Any:
    """Inspeciona chaves recursivamente, sem restringir valores de texto."""
    if isinstance(valor, dict):
        for chave, conteudo in valor.items():
            if isinstance(chave, str) and ("." in chave or chave.startswith("$")):
                raise ValueError("Nomes de campos não podem conter ponto nem começar com '$'.")
            validar_chaves(conteudo)
    elif isinstance(valor, list):
        for item in valor:
            validar_chaves(item)
    return valor


class DocumentoComChavesValidas(BaseModel):
    @model_validator(mode="before")
    @classmethod
    def validar_nomes_dos_campos(cls, dados: Any) -> Any:
        return validar_chaves(dados)
