"""
Ponto de entrada da API — Módulos 1, 2 e 3.

Módulo 1: Pessoas e Abrigos
Módulo 2: Doações e Mantimentos
Módulo 3: Relatórios

Rodar localmente:
    uvicorn backend.main:app --reload

Variáveis de ambiente esperadas (fornecidas pelo Integrante 1 - DBA):
    MONGO_URI   -> string de conexão do MongoDB Atlas (ou local)
    MONGO_DB_NAME -> nome do banco (padrão: abrigos_db)
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from backend.db import DB_NAME, ping
from backend.routes import pessoas, abrigos, doacoes, mantimentos, relatorios

app = FastAPI(
    title="Gestão de Resgatados e Doações",
    description=(
        "Módulo 1: Cadastro de pessoas resgatadas, gestão de abrigos e vínculo entre eles.\n"
        "Módulo 2: Logística de doações e controle de estoque de mantimentos nos abrigos.\n"
        "Módulo 3: Relatórios sobre necessidades médicas, suprimentos, ocupação e cadastros."
    ),
    version="0.2.0",
)

# Interface visual (Integrante 6) — permite chamadas do navegador à API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Módulo 1 — Pessoas e Abrigos
app.include_router(pessoas.router)
app.include_router(abrigos.router)

# Módulo 2 — Doações e Mantimentos
app.include_router(doacoes.router)
app.include_router(mantimentos.router)

# Módulo 3 — Relatórios e Inteligência
app.include_router(relatorios.router)


@app.get("/health")
def health():
    if not ping():
        raise HTTPException(status_code=503, detail="Sem conexão com o MongoDB")
    return {"status": "ok", "banco": DB_NAME}


# Interface visual (Integrante 6) — servida em http://localhost:8000/app
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.is_dir():
    app.mount("/app", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


@app.get("/", include_in_schema=False)
def raiz():
    # vai para a interface quando ela existir; senão, para a documentação
    return RedirectResponse(url="/app/" if FRONTEND_DIR.is_dir() else "/docs")
