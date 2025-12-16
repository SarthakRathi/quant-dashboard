import asyncio
import json
import sqlite3
import time
import pandas as pd
import requests
from datetime import datetime
from fastapi import FastAPI, WebSocket, Query, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from websockets import connect

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DATABASE ---
conn = sqlite3.connect("trades_opt.db", check_same_thread=False)
cursor = conn.cursor()
cursor.execute("""
    CREATE TABLE IF NOT EXISTS prices (
        timestamp TEXT,
        symbol TEXT,
        price REAL
    )
""")
cursor.execute("CREATE INDEX IF NOT EXISTS idx_sym_time ON prices(symbol, timestamp)")
conn.commit()

# --- API ---
@app.get("/symbols")
def get_available_symbols():
    try:
        r = requests.get("https://api.binance.com/api/v3/exchangeInfo")
        if r.status_code == 200:
            data = r.json()
            symbols = [s['symbol'] for s in data['symbols'] if s['symbol'].endswith('USDT') and s['status'] == 'TRADING']
            return {"symbols": sorted(symbols)}
    except:
        return {"symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT"]}

# --- HISTORY ENGINE ---
def fetch_snapshot_sync(symbols):
    """
    Synchronous function to download data.
    We will run this in a separate thread to avoid blocking the WebSocket.
    """
    # Create a new connection for this thread (SQLite rule)
    thread_conn = sqlite3.connect("trades_opt.db", check_same_thread=False)
    thread_cursor = thread_conn.cursor()

    for sym in symbols:
        try:
            # 1. Check if we have FRESH data (less than 2 mins old)
            thread_cursor.execute("SELECT MAX(rowid), timestamp FROM prices WHERE symbol=?", (sym,))
            row = thread_cursor.fetchone()
            
            should_fetch = True
            if row and row[1]:
                last_ts_str = row[1]
                # Simple check: Is the last timestamp matches current HH:MM?
                # (For a robust app, use full datetime, but this is fast for the assignment)
                now_str = datetime.now().strftime('%H:%M')
                if last_ts_str == now_str:
                    should_fetch = False
            
            if should_fetch:
                print(f"📥 Downloading history for {sym}...")
                # Delete old data to avoid jagged charts
                thread_cursor.execute("DELETE FROM prices WHERE symbol=?", (sym,))
                thread_conn.commit()

                # Fetch from Binance
                url = f"https://api.binance.com/api/v3/klines?symbol={sym.upper()}&interval=1m&limit=60"
                r = requests.get(url, timeout=5)
                if r.status_code == 200:
                    data = r.json()
                    for candle in data:
                        ts = datetime.fromtimestamp(candle[0]/1000).strftime('%H:%M')
                        price = float(candle[4])
                        thread_cursor.execute("INSERT INTO prices VALUES (?, ?, ?)", (ts, sym, price))
                    thread_conn.commit()
        except Exception as e:
            print(f"Fetch Error ({sym}): {e}")
    
    thread_conn.close()

def get_history_batch(active_symbols, prim, sec):
    """Reads DB and returns chart-ready data"""
    if not active_symbols: return []
    
    placeholders = ','.join(['?'] * len(active_symbols))
    query = f"SELECT timestamp, symbol, price FROM prices WHERE symbol IN ({placeholders}) ORDER BY rowid ASC"
    
    try:
        df = pd.read_sql_query(query, conn, params=tuple(active_symbols))
        if df.empty: return []

        df_pivot = df.pivot_table(index='timestamp', columns='symbol', values='price').reset_index()
        
        # Calculate Z-Score History
        if prim in df_pivot and sec in df_pivot:
            s1 = df_pivot[prim]
            s2 = df_pivot[sec]
            ratio = s1.mean() / s2.mean()
            spread = s1 - (ratio * s2)
            z = (spread - spread.mean()) / spread.std()
            df_pivot['z_score'] = z.fillna(0)
        else:
            df_pivot['z_score'] = 0

        return df_pivot.to_dict(orient='records')
    except Exception as e:
        print(f"Batch Error: {e}")
        return []

# --- LIVE ANALYTICS ---
def calculate_analytics(buffer_map, active_symbols, prim, sec):
    current_prices = {}
    for sym in active_symbols:
        if buffer_map[sym]:
            current_prices[sym] = buffer_map[sym][-1]
        else:
            # Fallback to DB
            cursor.execute("SELECT price FROM prices WHERE symbol=? ORDER BY rowid DESC LIMIT 1", (sym,))
            row = cursor.fetchone()
            current_prices[sym] = row[0] if row else 0

    # Heatmap & Live Z-Score logic
    placeholders = ','.join(['?'] * len(active_symbols))
    query = f"SELECT timestamp, symbol, price FROM prices WHERE symbol IN ({placeholders}) ORDER BY rowid DESC LIMIT {60 * len(active_symbols)}"
    df = pd.read_sql_query(query, conn, params=tuple(active_symbols))
    
    heatmap_data = {}
    z_score = 0
    
    if not df.empty:
        df_pivot = df.pivot_table(index='timestamp', columns='symbol', values='price')
        
        # Heatmap
        safe_cols = df_pivot.columns[:10]
        corr = df_pivot[safe_cols].corr().fillna(0)
        heatmap_data = {"z": corr.values.tolist(), "x": corr.columns.tolist(), "y": corr.columns.tolist()}

        # Z-Score
        if prim in df_pivot and sec in df_pivot:
            s1 = df_pivot[prim]
            s2 = df_pivot[sec]
            ratio = s1.mean() / s2.mean()
            p1 = current_prices.get(prim, 0)
            p2 = current_prices.get(sec, 0)
            spread_hist = s1 - (ratio * s2)
            curr_spread = p1 - (ratio * p2)
            z_score = (curr_spread - spread_hist.mean()) / spread_hist.std() if spread_hist.std() != 0 else 0

    return {
        "timestamp": datetime.now().strftime('%H:%M'),
        "prices": current_prices, 
        "z_score": round(z_score, 2),
        "heatmap": heatmap_data
    }

@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket, 
    watchlist: str = Query("btcusdt"), 
    primary: str = Query("btcusdt"), 
    secondary: str = Query("ethusdt")
):
    await websocket.accept()
    
    try:
        watch_list = [s.lower() for s in watchlist.split(',') if s.strip()]
        prim = primary.lower()
        sec = secondary.lower()
        all_symbols = list(set(watch_list + [prim, sec]))
        
        # 1. NON-BLOCKING FETCH (Fixes the "Not Fetched" issue)
        # We run the fetch in a separate thread so the socket doesn't hang
        await asyncio.to_thread(fetch_snapshot_sync, all_symbols)

        # 2. SEND HISTORY
        history = get_history_batch(all_symbols, prim, sec)
        await websocket.send_json({"type": "history_batch", "data": history})

        # 3. CONNECT BINANCE
        buffer_map = {s: [] for s in all_symbols}
        streams = "/".join([f"{s}@trade" for s in all_symbols])
        binance_url = f"wss://stream.binance.com:9443/ws/{streams}"

        last_min = -1
        last_broadcast = 0

        async with connect(binance_url) as binance_ws:
            while True:
                msg = await binance_ws.recv()
                raw = json.loads(msg)
                sym = raw['s'].lower()
                price = float(raw['p'])
                if sym in buffer_map: buffer_map[sym].append(price)

                now = time.time()
                curr_min = datetime.now().minute
                
                # Minute Close
                if curr_min != last_min and last_min != -1:
                    ts = datetime.now().strftime('%H:%M')
                    for s in all_symbols:
                        if buffer_map[s]:
                            cursor.execute("INSERT INTO prices VALUES (?, ?, ?)", (ts, s, buffer_map[s][-1]))
                    conn.commit()
                    stats = calculate_analytics(buffer_map, all_symbols, prim, sec)
                    await websocket.send_json({"type": "live_update", "data": stats})
                    for s in all_symbols:
                        if buffer_map[s]: buffer_map[s] = [buffer_map[s][-1]]
                    last_min = curr_min

                # Live Tick
                elif (now - last_broadcast) > 0.5:
                    stats = calculate_analytics(buffer_map, all_symbols, prim, sec)
                    await websocket.send_json({"type": "live_update", "data": stats})
                    last_broadcast = now

    except WebSocketDisconnect:
        print("Client Disconnected")
    except Exception as e:
        print(f"WS Error: {e}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)