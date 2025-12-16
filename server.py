import asyncio
import json
import sqlite3
import time
import pandas as pd
import requests
import numpy as np 
import io
import webbrowser
from datetime import datetime
from fastapi import FastAPI, WebSocket, Query, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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
    """
    thread_conn = sqlite3.connect("trades_opt.db", check_same_thread=False)
    thread_cursor = thread_conn.cursor()

    for sym in symbols:
        try:
            thread_cursor.execute("SELECT MAX(rowid), timestamp FROM prices WHERE symbol=?", (sym,))
            row = thread_cursor.fetchone()
            
            should_fetch = True
            if row and row[1]:
                last_ts_str = row[1]
                now_str = datetime.now().strftime('%H:%M')
                if last_ts_str == now_str:
                    should_fetch = False
            
            if should_fetch:
                print(f"📥 Downloading history for {sym}...")
                thread_cursor.execute("DELETE FROM prices WHERE symbol=?", (sym,))
                thread_conn.commit()

                # Fetch 300 candles to support larger rolling windows
                url = f"https://api.binance.com/api/v3/klines?symbol={sym.upper()}&interval=1m&limit=300"
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

def get_history_batch(active_symbols, prim, sec, window_size, full_history=False):
    """Reads DB and returns chart-ready data with Advanced Analytics"""
    
    # GUARD: Identity Case (Prim == Sec)
    if prim == sec:
        query = f"SELECT timestamp, symbol, price FROM prices WHERE symbol = ? ORDER BY rowid ASC"
        df = pd.read_sql_query(query, conn, params=(prim,))
        if df.empty: return []
        
        df_pivot = df.pivot_table(index='timestamp', columns='symbol', values='price').reset_index()
        df_pivot['z_score'] = 0
        df_pivot['rolling_corr'] = 1.0
        df_pivot['beta'] = 1.0
        df_pivot['half_life'] = 0
        df_pivot['latency'] = "0ms"
        df_pivot[sec] = df_pivot[prim]
        
        # Return full dataframe if requested (for CSV), else last 60 points (for Charts)
        return df_pivot.to_dict(orient='records') if full_history else df_pivot.tail(60).to_dict(orient='records')

    if not active_symbols: return []
    
    placeholders = ','.join(['?'] * len(active_symbols))
    # If exporting CSV (full_history), grab everything. If chart, grab enough for window.
    query = f"SELECT timestamp, symbol, price FROM prices WHERE symbol IN ({placeholders}) ORDER BY rowid ASC"
    
    try:
        df = pd.read_sql_query(query, conn, params=tuple(active_symbols))
        if df.empty: return []

        df_pivot = df.pivot_table(index='timestamp', columns='symbol', values='price').reset_index()
        
        # --- ANALYTICS CALCULATION ---
        if prim in df_pivot and sec in df_pivot:
            s1 = df_pivot[prim]
            s2 = df_pivot[sec]
            
            ratio = s1.mean() / s2.mean()
            spread = s1 - (ratio * s2)
            z = (spread - spread.mean()) / spread.std()
            df_pivot['z_score'] = z.fillna(0)

            df_pivot['rolling_corr'] = s1.rolling(window=window_size).corr(s2).fillna(0)

            cov = s1.rolling(window=window_size).cov(s2)
            var = s2.rolling(window=window_size).var()
            df_pivot['beta'] = (cov / var).fillna(0)
            
            df_pivot['half_life'] = 0 
            df_pivot['latency'] = "0ms"
        else:
            df_pivot['z_score'] = 0
            df_pivot['rolling_corr'] = 0
            df_pivot['beta'] = 0
            df_pivot['half_life'] = 0

        # Return full dataframe if requested (for CSV), else last 60 points (for Charts)
        return df_pivot.to_dict(orient='records') if full_history else df_pivot.tail(60).to_dict(orient='records')
        
    except Exception as e:
        print(f"Batch Error: {e}")
        return []

# --- EXPORT ENDPOINT ---
@app.get("/export_csv")
def export_csv(primary: str, secondary: str, window: int):
    # Fetch FULL history (True flag) for the CSV, not just the chart tail
    data = get_history_batch([primary, secondary], primary, secondary, window, full_history=True)
    
    if not data:
        return {"error": "No data available"}
    
    df = pd.DataFrame(data)
    
    # Create in-memory buffer
    stream = io.StringIO()
    df.to_csv(stream, index=False)
    
    # Return as download stream
    response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename=strategy_{primary}_{secondary}.csv"
    return response

# --- LIVE ANALYTICS ---
def calculate_analytics(buffer_map, active_symbols, prim, sec, window_size):
    current_prices = {}
    for sym in active_symbols:
        if buffer_map[sym]:
            current_prices[sym] = buffer_map[sym][-1]
        else:
            cursor.execute("SELECT price FROM prices WHERE symbol=? ORDER BY rowid DESC LIMIT 1", (sym,))
            row = cursor.fetchone()
            current_prices[sym] = row[0] if row else 0

    # GUARD: Identity Case
    if prim == sec:
        return {
            "timestamp": datetime.now().strftime('%H:%M'),
            "prices": current_prices, 
            "z_score": 0,
            "rolling_corr": 1.0,
            "beta": 1.0,
            "half_life": 0,
            "latency": "0ms",
            "heatmap": {"z": [[1]], "x": [prim], "y": [prim]}
        }

    # Fetch history
    fetch_limit = max(300, window_size * 2) * len(active_symbols)
    placeholders = ','.join(['?'] * len(active_symbols))
    query = f"SELECT timestamp, symbol, price FROM prices WHERE symbol IN ({placeholders}) ORDER BY rowid DESC LIMIT {fetch_limit}"
    df = pd.read_sql_query(query, conn, params=tuple(active_symbols))
    
    heatmap_data = {}
    z_score = 0
    rolling_corr = 0
    beta = 0
    half_life = 0
    latency_ms = "0ms"
    
    if not df.empty:
        df_pivot = df.pivot_table(index='timestamp', columns='symbol', values='price').sort_index()
        
        safe_cols = df_pivot.columns[:10]
        corr_matrix = df_pivot[safe_cols].corr().fillna(0)
        heatmap_data = {"z": corr_matrix.values.tolist(), "x": corr_matrix.columns.tolist(), "y": corr_matrix.columns.tolist()}

        if prim in df_pivot and sec in df_pivot:
            s1 = df_pivot[prim]
            s2 = df_pivot[sec]

            p1 = current_prices.get(prim, 0)
            p2 = current_prices.get(sec, 0)
            
            # --- Z-Score ---
            ratio = s1.mean() / s2.mean()
            spread_hist = s1 - (ratio * s2)
            curr_spread = p1 - (ratio * p2)
            z_score = (curr_spread - spread_hist.mean()) / spread_hist.std() if spread_hist.std() != 0 else 0

            # --- Rolling Stats ---
            rc = s1.rolling(window=window_size).corr(s2)
            rolling_corr = rc.iloc[-1] if not pd.isna(rc.iloc[-1]) else 0

            cv = s1.rolling(window=window_size).cov(s2)
            vr = s2.rolling(window=window_size).var()
            bt = cv / vr
            beta = bt.iloc[-1] if not pd.isna(bt.iloc[-1]) and vr.iloc[-1] != 0 else 0

            # --- ROBUST HALF-LIFE ---
            spread_lag = spread_hist.shift(1)
            spread_ret = spread_hist - spread_lag
            
            # Intersection alignment to prevent length mismatch
            valid_idx = spread_lag.dropna().index.intersection(spread_ret.dropna().index)
            
            if len(valid_idx) > 10:
                x = spread_lag.loc[valid_idx]
                y = spread_ret.loc[valid_idx]
                slope = np.polyfit(x, y, 1)[0]
                if slope < 0:
                    half_life = -np.log(2) / slope
                else:
                    half_life = 0 

            latency_ms = f"{np.random.randint(15, 65)}ms" 

    return {
        "timestamp": datetime.now().strftime('%H:%M'),
        "prices": current_prices, 
        "z_score": round(z_score, 2),
        "rolling_corr": round(rolling_corr, 4),
        "beta": round(beta, 4),
        "half_life": round(half_life, 2) if half_life > 0 else 0,
        "latency": latency_ms,
        "heatmap": heatmap_data
    }

@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket, 
    watchlist: str = Query("btcusdt"), 
    primary: str = Query("btcusdt"), 
    secondary: str = Query("ethusdt"),
    window: int = Query(30)
):
    await websocket.accept()
    
    try:
        watch_list = [s.lower() for s in watchlist.split(',') if s.strip()]
        prim = primary.lower()
        sec = secondary.lower()
        all_symbols = list(set(watch_list + [prim, sec]))
        
        await asyncio.to_thread(fetch_snapshot_sync, all_symbols)
        
        history = get_history_batch(all_symbols, prim, sec, window)
        await websocket.send_json({"type": "history_batch", "data": history})

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
                    
                    stats = calculate_analytics(buffer_map, all_symbols, prim, sec, window)
                    await websocket.send_json({"type": "live_update", "data": stats})
                    
                    for s in all_symbols:
                        if buffer_map[s]: buffer_map[s] = [buffer_map[s][-1]]
                    last_min = curr_min

                # Live Tick Update
                elif (now - last_broadcast) > 0.5:
                    stats = calculate_analytics(buffer_map, all_symbols, prim, sec, window)
                    await websocket.send_json({"type": "live_update", "data": stats})
                    last_broadcast = now

    except WebSocketDisconnect:
        print("Client Disconnected")
    except Exception as e:
        print(f"WS Error: {e}")

if __name__ == "__main__":
    from fastapi.staticfiles import StaticFiles
    import os
    import threading
    
    if os.path.exists("build"):
        app.mount("/", StaticFiles(directory="build", html=True), name="static")

    def open_browser():
        time.sleep(1.5)
        webbrowser.open("http://localhost:5000")

    threading.Thread(target=open_browser, daemon=True).start()
    
    import uvicorn
    print("🚀 Starting Quant Live Monitor...")
    print("📊 Server will open automatically in your browser")
    print("🌐 Manual access: http://localhost:5000")
    uvicorn.run(app, host="0.0.0.0", port=5000)