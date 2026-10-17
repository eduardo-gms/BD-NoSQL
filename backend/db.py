import os
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import PyMongoError

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("MONGO_DB_NAME", "abrigos_db")

if not MONGO_URI:
    raise RuntimeError(
        "MONGO_URI não encontrada. Configure o arquivo .env "
        "(veja .env.example)."
    )

_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = _client[DB_NAME]


def ping() -> bool:
    """Testa se o cluster está respondendo."""
    try:
        _client.admin.command("ping")
        return True
    except PyMongoError:
        return False


def get_collection(nome: str):
    """Retorna a coleção pelo nome (ex: 'pessoas', 'abrigos', 'doacoes')."""
    return db[nome]