"""
Ponto de entrada da API — Módulo 1 (Pessoas e Abrigos).

Rodar localmente:
    uvicorn backend.main:app --reload

Variáveis de ambiente esperadas (fornecidas pelo Integrante 1 - DBA):
    MONGO_URI   -> string de conexão do MongoDB Atlas (ou local)
    MONGO_DB    -> nome do banco
"""

from fastapi import FastAPI

from backend.routes import pessoas, abrigos

app = FastAPI(
    title="Gestão de Resgatados e Doações — Módulo 1",
    description="Cadastro de pessoas resgatadas, gestão de abrigos e vínculo entre eles.",
    version="0.1.0",
)

app.include_router(pessoas.router)
app.include_router(abrigos.router)


@app.get("/health")
def health():
    return {"status": "ok"}