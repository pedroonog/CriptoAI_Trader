import sqlite3
import os

print("🔍 Procurando todos os arquivos .db...")
print()

db_encontrados = []

for root, dirs, files in os.walk("."):
    for f in files:
        if f.endswith(".db"):
            caminho = os.path.join(root, f)
            tamanho = os.path.getsize(caminho)
            db_encontrados.append((caminho, tamanho))
            print(f"  📁 {caminho} ({tamanho} bytes)")

if not db_encontrados:
    print("❌ Nenhum arquivo .db encontrado na pasta backend/")
    exit(1)

print()
print("🧪 Verificando tabelas em cada banco...")
print()

for caminho, _ in db_encontrados:
    try:
        conn = sqlite3.connect(caminho)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tabelas = [row[0] for row in cursor.fetchall()]
        conn.close()
        
        print(f"  📁 {caminho}")
        if tabelas:
            for t in tabelas:
                cursor = sqlite3.connect(caminho).cursor()
                cursor.execute(f"PRAGMA table_info({t})")
                colunas = [col[1] for col in cursor.fetchall()]
                print(f"    📋 Tabela '{t}': {colunas}")
        else:
            print(f"    ⚠️  Banco vazio (sem tabelas)")
        print()
    except Exception as e:
        print(f"  ❌ Erro ao ler {caminho}: {e}")
        print()