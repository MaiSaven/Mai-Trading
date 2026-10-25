import os
import sys
import json
import time
import random
import argparse
import requests
from datetime import datetime, timedelta

# Import connector helpers
from account import get_account_info
from positions import get_open_positions
from history import get_deal_history

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

def load_config():
    defaults = {
        "account_login": None,
        "account_password": "",
        "server": "",
        "terminal_path": r"C:\Program Files\MetaTrader 5\terminal64.exe",
        "backend_sync_url": "http://localhost:8000/api/v1/sync",
        "api_key": "mai-trading-secret-key",
        "sync_interval_seconds": 10,
        "history_days": 60,
        "auto_simulation_fallback": True
    }
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
                user_conf = json.load(f)
                defaults.update(user_conf)
        except Exception as e:
            print(f"[WARN] Could not parse config.json: {e}")
    return defaults

def init_mt5(config):
    if not MT5_AVAILABLE:
        print("[ERROR] MetaTrader5 python library is not installed.")
        return False

    print("Connecting to MetaTrader 5 terminal...")
    
    # 1. Try connecting to currently active terminal
    if mt5.initialize():
        info = mt5.account_info()
        if info:
            print(f"[SUCCESS] Connected to MT5! Account: {info.login} ({info.company}), Server: {info.server}")
            return True

    # 2. Try explicit path / credentials if configured
    term_path = config.get("terminal_path")
    login = config.get("account_login")
    password = config.get("account_password")
    server = config.get("server")

    init_args = {}
    if term_path and os.path.exists(term_path):
        init_args["path"] = term_path
    if login and password and server:
        init_args["login"] = int(login)
        init_args["password"] = password
        init_args["server"] = server

    if init_args and mt5.initialize(**init_args):
        info = mt5.account_info()
        if info:
            print(f"[SUCCESS] Connected to MT5 with config credentials! Account: {info.login}")
            return True

    last_err = mt5.last_error()
    print(f"\n[ALERT] MT5 Initialization failed: {last_err}")
    if last_err[0] == -6:
        print("  -> Reason: 'Terminal: Authorization failed'.")
        print("  -> Troubleshooting Steps:")
        print("     1. Open MetaTrader 5 desktop on your computer.")
        print("     2. Check the bottom-right corner: it should show green/blue connection bars.")
        print("     3. In MT5, click 'File' -> 'Login to Trade Account' and enter your broker credentials.")
        print("     4. Alternatively, put your login/password/server inside 'mt5-connector/config.json'.")
    return False

def run_simulation_sync(config):
    print("\n" + "=" * 60)
    print("  SIMULATION WORKER MODE ACTIVATED")
    print("  Generating live market ticks & syncing to MAI Dashboard...")
    print("  Press Ctrl+C to stop.")
    print("=" * 60 + "\n")

    backend_url = config.get("backend_sync_url", "http://localhost:8000/api/v1/sync")
    api_key = config.get("api_key", "mai-trading-secret-key")
    interval = config.get("sync_interval_seconds", 10)

    # First trigger demo seed on backend if needed
    try:
        seed_url = backend_url.replace("/sync", "/sync/seed-demo")
        requests.post(seed_url, timeout=5)
    except Exception:
        pass

    # sim_balance = 102450.00
    # pos_xau_profit = 360.00
    # pos_eur_profit = 310.00
    sim_balance = 0
    pos_xau_profit = 0
    pos_eur_profit = 0

    while True:
        try:
            # Tick jitter
            pos_xau_profit = round(pos_xau_profit + random.choice([-15.0, -7.5, 0.0, 10.0, 22.5]), 2)
            pos_eur_profit = round(pos_eur_profit + random.choice([-8.0, -4.0, 0.0, 6.0, 12.0]), 2)
            total_floating = round(pos_xau_profit + pos_eur_profit, 2)
            sim_equity = round(sim_balance + total_floating, 2)

            payload = {
                "account": {
                    "account_id": 5892104,
                    "broker": "MetaQuotes-Demo (Simulated)",
                    "currency": "USD",
                    "balance": sim_balance,
                    "equity": sim_equity,
                    "margin": 1200.0,
                    "free_margin": round(sim_equity - 1200.0, 2),
                    "leverage": 100,
                    "profit": total_floating
                },
                "positions": [
                    {
                        "ticket": 981023,
                        "symbol": "XAUUSD",
                        "type": "BUY",
                        "volume": 0.50,
                        "price_open": 2735.40,
                        "price_current": round(2735.40 + (pos_xau_profit / 50.0), 2),
                        "sl": 2725.00,
                        "tp": 2760.00,
                        "profit": pos_xau_profit,
                        "swap": -2.50,
                        "time": int(time.time() - 3600)
                    },
                    {
                        "ticket": 981024,
                        "symbol": "EURUSD",
                        "type": "SELL",
                        "volume": 1.00,
                        "price_open": 1.0850,
                        "price_current": round(1.0850 - (pos_eur_profit / 10000.0), 5),
                        "sl": 1.0890,
                        "tp": 1.0770,
                        "profit": pos_eur_profit,
                        "swap": -1.20,
                        "time": int(time.time() - 1800)
                    }
                ],
                "deals": []
            }

            headers = {"X-API-Key": api_key}
            res = requests.post(backend_url, json=payload, headers=headers, timeout=5)
            print(f"[{time.strftime('%H:%M:%S')}] Simulated Sync: status={res.status_code} | Equity=${sim_equity:,.2f} | Floating PnL=${total_floating:+,.2f}")
        except Exception as e:
            print(f"[{time.strftime('%H:%M:%S')}] Sim Sync Error: {e}")

        time.sleep(interval)

def run_live_sync(config):
    backend_url = config.get("backend_sync_url", "http://localhost:8000/api/v1/sync")
    api_key = config.get("api_key", "mai-trading-secret-key")
    interval = config.get("sync_interval_seconds", 10)
    history_days = config.get("history_days", 60)

    print("\n" + "=" * 60)
    print("  LIVE MT5 SYNC WORKER RUNNING")
    print(f"  Backend: {backend_url}")
    print(f"  Polling interval: {interval}s")
    print("  Press Ctrl+C to stop.")
    print("=" * 60 + "\n")

    try:
        while True:
            account = get_account_info()
            if not account:
                print(f"[{time.strftime('%H:%M:%S')}] [WARN] MT5 not authorized or disconnected. Re-checking...")
                time.sleep(interval)
                continue

            positions = get_open_positions()
            deals = get_deal_history(days=history_days)

            payload = {
                "account": account,
                "positions": positions,
                "deals": deals
            }

            headers = {"X-API-Key": api_key}
            try:
                res = requests.post(backend_url, json=payload, headers=headers, timeout=6)
                if res.status_code == 200:
                    data = res.json()
                    print(f"[{time.strftime('%H:%M:%S')}] Synced: {len(positions)} open pos, {len(deals)} deals | Balance: ${account['balance']:,.2f}")
                else:
                    print(f"[{time.strftime('%H:%M:%S')}] Sync Warning: HTTP {res.status_code} - {res.text}")
            except Exception as e:
                print(f"[{time.strftime('%H:%M:%S')}] Backend Connection Error: {e}")

            time.sleep(interval)
    except KeyboardInterrupt:
        print("\nSync worker stopped by user.")
    finally:
        if MT5_AVAILABLE:
            mt5.shutdown()

def main():
    parser = argparse.ArgumentParser(description="MAI-TRADING MT5 Data Sync Worker")
    parser.add_argument("--mock", action="store_true", help="Force simulation mode")
    parser.add_argument("--seed", action="store_true", help="Seed backend demo data and exit")
    parser.add_argument("--interval", type=int, help="Polling interval in seconds")
    args = parser.parse_args()

    config = load_config()
    if args.interval:
        config["sync_interval_seconds"] = args.interval

    if args.seed:
        backend_url = config.get("backend_sync_url", "http://localhost:8000/api/v1/sync")
        seed_url = backend_url.replace("/sync", "/sync/seed-demo")
        try:
            res = requests.post(seed_url, timeout=5)
            print("Seed Response:", res.json())
        except Exception as e:
            print("Seed Error:", e)
        return

    if args.mock:
        run_simulation_sync(config)
        return

    # Try live connection
    connected = init_mt5(config)
    if connected:
        run_live_sync(config)
    else:
        if config.get("auto_simulation_fallback", True):
            print("\n[INFO] Starting Simulation Mode so your trading journal dashboard functions immediately.")
            print("[INFO] To switch to live MT5 later, log in to your account inside the MT5 terminal and restart sync.py.")
            run_simulation_sync(config)
        else:
            print("\n[ERROR] MT5 could not be initialized and simulation fallback is disabled in config.json.")

if __name__ == "__main__":
    main()