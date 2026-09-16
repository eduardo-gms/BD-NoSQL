"""
Ponto de entrada da API — Módulos 1 e 2.

Módulo 1: Pessoas e Abrigos
Módulo 2: Doações e Mantimentos

Rodar localmente:
    uvicorn backend.main:app --reload

Variáveis de ambiente esperadas (fornecidas pelo Integrante 1 - DBA):
    MONGO_URI   -> string de conexão do MongoDB Atlas (ou local)
    MONGO_DB    -> nome do banco
"""

from fastapi import FastAPI

from backend.routes import pessoas, abrigos, doacoes, mantimentos

app = FastAPI(
    title="Gestão de Resgatados e Doações",
    description=(
        "Módulo 1: Cadastro de pessoas resgatadas, gestão de abrigos e vínculo entre eles.\n"
        "Módulo 2: Logística de doações e controle de estoque de mantimentos nos abrigos."
    ),
    version="0.2.0",
)

# Módulo 1 — Pessoas e Abrigos
app.include_router(pessoas.router)
app.include_router(abrigos.router)

# Módulo 2 — Doações e Mantimentos
app.include_router(doacoes.router)
app.include_router(mantimentos.router)


@app.get("/health")
def health():
    return {"status": "ok"}