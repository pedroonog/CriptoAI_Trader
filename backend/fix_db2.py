import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "trades.db")

print(f"📁 Corrigindo: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("PRAGMA table_info(history)")
colunas = [col[1] for col in cursor.fetchall()]
print(f"📋 Colunas atuais: {colunas}")

if "ai_score" not in colunas:
    conn.execute("ALTER TABLE history ADD COLUMN ai_score REAL DEFAULT 0")
    print("✅ Coluna ai_score ADICIONADA!")
else:
    print("⚠️ Coluna ai_score já existe")

if "rsi" not in colunas:
    conn.execute("ALTER TABLE history ADD COLUMN rsi REAL DEFAULT 0")
    print("✅ Coluna rsi ADICIONADA!")
else:
    print("⚠️ Coluna rsi já existe")

conn.commit()
conn.close()
print("\n✅ Pronto! Reinicie o backend.")