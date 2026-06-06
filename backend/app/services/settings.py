import json
import os

SETTINGS_FILE = "settings.json"

DEFAULT_SETTINGS = {
    "rsi_buy": 30,
    "rsi_sell": 70,
    "stop_loss_pct": 5.0,
    "take_profit_pct": 10.0,
    "trade_amount_usd": 100.0
}

def get_settings():
    if not os.path.exists(SETTINGS_FILE):
        save_settings(DEFAULT_SETTINGS)
        return DEFAULT_SETTINGS
    try:
        with open(SETTINGS_FILE, "r") as f:
            return json.load(f)
    except:
        return DEFAULT_SETTINGS

def save_settings(settings):
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=4)
    return True