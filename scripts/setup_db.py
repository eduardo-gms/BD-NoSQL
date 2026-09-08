import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("MONGO_DB_NAME", "abrigos_db")

COLLECTIONS = ["pessoas", "abrigos", "doacoes"]

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = client[DB_NAME]

existentes = db.list_collection_names()

for nome in COLLECTIONS:
    if nome in existentes:
        print(f"  Coleção '{nome}' já existe, pulando.")
        continue
    db.create_collection(nome)
    print(f" Coleção '{nome}' criada em '{DB_NAME}'.")

print("\nColeções atuais no banco:", db.list_collection_names())

client.close()