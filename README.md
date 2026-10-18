# Sistema de Gestão de Resgatados e Doações em Desastres Naturais 

Este projeto aplica tecnologias de bancos de dados não convencionais (NoSQL) na resolução de um problema social real: a gestão caótica de informações em cenários de desastres naturais. 

Utilizando **MongoDB**, o sistema lida com dados heterogêneos de vítimas (cadastros incompletos, informações médicas, contatos de emergência) e o controle dinâmico de doações e abrigos, demonstrando a superioridade de um modelo *schema-less* para situações de crise.

## Stack Tecnológica

- **Linguagem:** Python 3.12
- **Banco de Dados:** MongoDB Atlas
- **Backend (API):** FastAPI, PyMongo
- **Frontend (Interface):** HTML + CSS + JavaScript puro (servido pelo FastAPI em `/app`)
- **Testes / QA:** Coleção Postman com testes automáticos (Newman)
- **Dados Fictícios:** Node.js + Faker (`scripts/seed.js`)

## Estrutura do Projeto

```text
BD-NoSQL/
├── backend/            # API Rest com FastAPI
├── frontend/           # Interface visual (index.html, styles.css, app.js)
├── postman/            # Coleção Postman com testes automatizados
├── docs/               # Roteiro de testes e apresentação ao vivo
├── scripts/            # Scripts de automação e carga de dados
└── README.md           # Documentação
```

## Como executar

```bash
# 1. Ambiente Python
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 2. Crie o .env a partir do exemplo e teste a conexão
cp .env.example .env          # depois preencha MONGO_URI e MONGO_DB_NAME com os dados do grupo
python scripts/test_connection.py
python scripts/setup_db.py   # cria as coleções que faltarem

# 3. Popule o banco com dados fictícios
cd scripts && npm install && node seed.js && cd ..

# 4. Suba a API + interface
uvicorn backend.main:app --reload
```

| O quê | Endereço |
|---|---|
| Interface web | <http://localhost:8000/app/> |
| Swagger (documentação da API) | <http://localhost:8000/docs> |

## Interface visual

Painel web que consome **todas** as rotas da API:

- **Painel:** indicadores, ocupação dos abrigos e quantos "formatos" de documento existem em cada coleção (prova do *schema-less*).
- **Pessoas:** cadastro e edição pelo mesmo formulário, com campos livres em "Outras informações" (sem precisar de JSON), exemplos prontos e vínculo/transferência/desvínculo de abrigo.
- **Abrigos:** cadastro, edição (status, capacidade, coordenador, necessidades urgentes) e exclusão, que só é permitida sem pessoas vinculadas nem estoque.
- **Doações:** registro com perfis diferentes, filtros (categoria, item, doador), edição e exclusão. O botão **Destinar** envia a doação para o estoque de um abrigo.
- **Mantimentos:** entrada, saída, redistribuição entre abrigos e histórico de movimentações. Uma entrada de item que o abrigo já tem soma ao estoque existente.
- **Escassez:** abrigos com falta de suprimentos e envio rápido a partir de outros abrigos.
- **Requisições:** painel lateral com cada chamada feita à API (método, rota, status e JSON).
- **Status da conexão:** a barra lateral indica se a API está no ar e se o MongoDB respondeu (`GET /health` faz um ping no banco).

> Também dá para abrir `frontend/index.html` direto no navegador: a URL da API pode ser configurada na barra lateral (o CORS está liberado).

## Testes (Postman)

Importe `postman/BD-NoSQL.postman_collection.json` no Postman e use **Run collection**, ou rode pelo terminal:

```bash
npx newman run postman/BD-NoSQL.postman_collection.json
```

Os IDs criados ficam salvos automaticamente em variáveis da coleção. São 57 requisições e 93 verificações, cobrindo sucesso e erro (404, 409, 422).
