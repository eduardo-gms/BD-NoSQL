import os
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ConfigurationError

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise RuntimeError(
        "MONGO_URI não encontrada. Crie um arquivo .env na raiz do "
        "projeto com base no .env.example."
    )

try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    print(" Conexão com o Atlas funcionando!")

    print("Bancos disponíveis:", client.list_database_names())

except ConfigurationError as e:
    print(" Erro na string de conexão (formato/DNS):", e)
except ConnectionFailure as e:
    print(" Não foi possível conectar ao cluster:", e)
finally:
    client.close()