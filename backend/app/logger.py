# logger.py
from collections import deque
from datetime import datetime
import threading

_log_buffer = deque(maxlen=150)   # Guarda as últimas 150 linhas
_lock = threading.Lock()

def add_log(message):
    """Adiciona log ao buffer + printa no terminal"""
    with _lock:
        ts = datetime.now().strftime("%H:%M:%S")
        _log_buffer.append(f"[{ts}] {message}")
    print(message)

def get_logs():
    with _lock:
        return list(_log_buffer)