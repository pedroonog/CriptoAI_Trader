import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "trades.db")

print(f"📁 Corrigindo: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("PRAGMA table_info(history)")
colunas = [col[1] for col in cursor.fetchall()]
print(f"📋 Colunas atuais: {colunas}")

# Todas as colunas que podem faltar
colunas_para_adicionar = {
    "ai_score": "REAL DEFAULT 0",
    "rsi": "REAL DEFAULT 0",
    "time_in_market": "INTEGER DEFAULT 0",
}

for nome, tipo in colunas_para_adicionar.items():
    if nome not in colunas:
        conn.execute(f"ALTER TABLE history ADD COLUMN {nome} {tipo}")
        print(f"✅ Coluna '{nome}' ADICIONADA!")
    else:
        print(f"⚠️ Coluna '{nome}' já existe")

conn.commit()
conn.close()
print("\n✅ Banco atualizado! Reinicie o backend.")