# 📊 Quant Live Monitor

A real-time cryptocurrency pairs trading dashboard with advanced statistical analysis and live market data visualization. Monitor spread dynamics, z-scores, correlations, and hedge ratios for crypto trading pairs with professional-grade analytics.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.8+-blue.svg)
![React](https://img.shields.io/badge/react-18.0+-61dafb.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-009688.svg)

markdown## 📸 Architecture Diagram

### Dashboard Overview
![Architecture Diagram](https://github.com/SarthakRathi/quant-dashboard/blob/6284603e1bc49ceefb0e02a580709940ce8bda4e/architecture%20diagram.png)

## ✨ Features

### 📈 Real-Time Market Data
- **Live price streaming** from Binance via WebSocket
- **Sub-second updates** with configurable refresh rates
- **Historical data** with 300-candle lookback window
- **Multiple symbol tracking** with watchlist support

### 🧮 Advanced Analytics
- **Z-Score Calculation**: Real-time spread mean reversion signals
- **Rolling Correlation**: Dynamic relationship tracking between pairs
- **Beta Calculation**: Hedge ratio computation using rolling OLS
- **Half-Life Estimation**: Mean reversion speed indicators
- **Correlation Heatmap**: Multi-asset correlation visualization

### 🎨 Professional UI
- **Dark theme** optimized for extended trading sessions
- **Fullscreen charts** for detailed analysis
- **Interactive controls** for threshold and window adjustments
- **Alert system** with configurable z-score triggers
- **Responsive design** that works on desktop and tablet

### 📥 Data Export
- **CSV export** with full historical data
- **Downloadable analytics** for backtesting
- **Complete time series** with all calculated metrics

## 🛠️ Tech Stack

### Backend
- **FastAPI**: High-performance async web framework
- **Python 3.8+**: Core programming language
- **SQLite**: Embedded database for price storage
- **Pandas**: Data manipulation and analytics
- **NumPy**: Numerical computations
- **WebSockets**: Real-time bidirectional communication
- **Uvicorn**: ASGI server

### Frontend
- **React 18**: UI framework
- **Recharts**: Chart visualization
- **Plotly.js**: Interactive heatmaps
- **React WebSocket Hook**: Real-time data streaming

### Data Source
- **Binance API**: Market data and WebSocket streams

## 📋 Prerequisites

- **Python 3.8 or higher**
- **Node.js 14 or higher**
- **npm or yarn**
- **Internet connection** (for Binance API access)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/quant-live-monitor.git
cd quant-live-monitor
```

### 2. Install Python Dependencies

```bash
pip install -r requirements.txt
```

Or install manually:

```bash
pip install fastapi uvicorn websockets pandas numpy requests
```

### 3. Install Node Dependencies

```bash
npm install
```

### 4. Build the React Frontend

```bash
npm run build
```

### 5. Start the Server

```bash
python server.py
```

The application will automatically open in your default browser at `http://localhost:5000`

## 📁 Project Structure

```
quant-live-monitor/
├── server.py              # FastAPI backend server
├── trades_opt.db          # SQLite database (auto-created)
├── requirements.txt       # Python dependencies
├── package.json           # Node.js dependencies
│
├── src/                   # React source files
│   ├── App.js            # Main React component
│   ├── index.js          # React entry point
│   └── ...
│
├── public/               # Static assets
│   └── index.html
│
├── build/                # Production build (created by npm run build)
│   ├── index.html
│   ├── static/
│   └── ...
│
└── README.md            # This file
```

## ⚙️ Configuration

### Server Configuration

Edit `server.py` to change server settings:

```python
# Port configuration
uvicorn.run(app, host="0.0.0.0", port=5000)

# Database connection
conn = sqlite3.connect("trades_opt.db", check_same_thread=False)

# Historical data limit (number of candles)
url = f"https://api.binance.com/api/v3/klines?symbol={sym.upper()}&interval=1m&limit=300"
```

### Frontend Configuration

Default settings in `App.js`:

```javascript
const [alertThreshold, setAlertThreshold] = useState(2.0);  // Z-score alert threshold
const [windowSize, setWindowSize] = useState(30);           // Rolling window (minutes)
const [watchlist, setWatchlist] = useState(['BTCUSDT', 'ETHUSDT']);
```

## 🔌 API Endpoints

### REST Endpoints

#### Get Available Symbols
```
GET /symbols
```
Returns list of all tradeable USDT pairs from Binance.

**Response:**
```json
{
  "symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT", ...]
}
```

#### Export CSV
```
GET /export_csv?primary=BTCUSDT&secondary=ETHUSDT&window=30
```
Downloads complete historical data with analytics as CSV.

**Parameters:**
- `primary`: Primary trading symbol
- `secondary`: Secondary trading symbol  
- `window`: Rolling window size in minutes

### WebSocket Endpoint

#### Live Data Stream
```
WS /ws?watchlist=btcusdt,ethusdt&primary=btcusdt&secondary=ethusdt&window=30
```

**Parameters:**
- `watchlist`: Comma-separated list of symbols to track
- `primary`: Primary symbol for pair analysis
- `secondary`: Secondary symbol for pair analysis
- `window`: Rolling window for calculations (minutes)

**Message Types:**

1. **history_batch**: Initial historical data load
```json
{
  "type": "history_batch",
  "data": [
    {
      "timestamp": "14:30",
      "btcusdt": 43250.5,
      "ethusdt": 2280.3,
      "z_score": -1.2,
      "rolling_corr": 0.85,
      "beta": 0.052,
      "half_life": 45.2
    },
    ...
  ]
}
```

2. **live_update**: Real-time price and analytics updates
```json
{
  "type": "live_update",
  "data": {
    "timestamp": "14:31",
    "prices": {
      "btcusdt": 43260.2,
      "ethusdt": 2281.5
    },
    "z_score": -1.15,
    "rolling_corr": 0.86,
    "beta": 0.053,
    "half_life": 44.8,
    "latency": "35ms",
    "heatmap": {
      "z": [[1, 0.86], [0.86, 1]],
      "x": ["btcusdt", "ethusdt"],
      "y": ["btcusdt", "ethusdt"]
    }
  }
}
```

## 📊 Analytics Explained

### Z-Score
Measures how many standard deviations the current spread is from its mean.

```
spread = price_A - (hedge_ratio * price_B)
z_score = (current_spread - mean_spread) / std_spread
```

**Trading Signals:**
- `z > +2`: Short spread (short A, long B)
- `z < -2`: Long spread (long A, short B)
- `-2 < z < +2`: No signal

### Rolling Correlation
Pearson correlation coefficient over a rolling window.

```
correlation = corr(price_A, price_B) over N minutes
```

**Interpretation:**
- `> 0.8`: Strong positive correlation (good for pairs trading)
- `< 0.5`: Weak correlation (poor pair candidate)

### Beta (Hedge Ratio)
Rolling regression coefficient indicating optimal hedge size.

```
beta = cov(price_A, price_B) / var(price_B)
```

**Usage:**
For every $1 of asset B, hold $beta of asset A.

### Half-Life
Estimated time for spread to revert to mean.

```
spread_return = spread_t - spread_{t-1}
half_life = -ln(2) / regression_slope
```

**Interpretation:**
Lower half-life indicates faster mean reversion.

## 🎮 Usage Guide

### Starting a Trading Session

1. **Launch the application**
   ```bash
   python server.py
   ```

2. **Select your trading pair**
   - Use the dropdowns to choose PRIMARY and SECONDARY assets
   - Popular pairs: BTC/ETH, ETH/SOL, BNB/ETH

3. **Configure analysis window**
   - Choose lookback period: 15min, 30min, 1hr, 2hr, 5hr
   - Shorter windows = faster signals, more noise
   - Longer windows = stable signals, slower response

4. **Set alert threshold**
   - Default: ±2.0 standard deviations
   - Conservative: ±2.5 or ±3.0
   - Aggressive: ±1.5

5. **Monitor signals**
   - Watch z-score chart for entry/exit points
   - Check correlation stays above 0.8
   - Verify half-life is reasonable (10-60 minutes)

### Exporting Data

Click the download button (⬇) in the top right to export all data as CSV for:
- Backtesting strategies
- External analysis in Python/Excel
- Record keeping

### Fullscreen Mode

Click the fullscreen button (⛶) on any chart to expand it for detailed analysis.

## 🔧 Development

### Running in Development Mode

**Backend (Terminal 1):**
```bash
python server.py
```

**Frontend with Hot Reload (Terminal 2):**
```bash
npm start
```

Frontend runs on `http://localhost:3000` with hot reload.

### Building for Production

```bash
npm run build
python server.py
```

Access at `http://localhost:5000`

### Running Tests

```bash
# Python tests (if implemented)
pytest

# React tests
npm test
```

## 🐛 Troubleshooting

### Issue: Browser doesn't open automatically

**Solution:** The server still runs correctly. Manually open `http://localhost:5000`

### Issue: WebSocket connection failed

**Symptoms:** "Reconnecting..." message, no live data

**Solutions:**
1. Check internet connection
2. Verify Binance is accessible in your region
3. Check firewall settings
4. Restart the server

### Issue: No data showing

**Symptoms:** Empty charts, loading spinner

**Solutions:**
1. Wait 30-60 seconds for initial data download
2. Check console for errors (`F12` in browser)
3. Verify selected symbols are valid
4. Ensure `trades_opt.db` has write permissions

### Issue: "Cannot GET /"

**Symptoms:** 404 error when accessing localhost:5000

**Solutions:**
1. Run `npm run build` first
2. Verify `build/` folder exists
3. Check `server.py` has static file mounting code

### Issue: High memory usage

**Symptoms:** System slowdown over time

**Solutions:**
1. Reduce window size (less data in memory)
2. Limit watchlist to 2-3 symbols
3. Restart server periodically for long sessions

### Issue: Inaccurate analytics

**Symptoms:** Strange z-scores, correlations

**Solutions:**
1. Wait for sufficient data (at least 30 data points)
2. Avoid identical primary/secondary symbols
3. Choose liquid, actively traded pairs
4. Verify correct symbol spelling

## 📈 Performance Tips

1. **Limit watchlist size**: Track only the pairs you're analyzing
2. **Choose appropriate window size**: Longer windows use more memory
3. **Close unused browser tabs**: Free up system resources
4. **Use wired connection**: More stable than WiFi for WebSocket
5. **Monitor system resources**: Keep CPU/RAM usage reasonable

## 🔒 Security Notes

- **API Keys**: This version uses public Binance data (no API keys needed)
- **Localhost only**: Default binding to 0.0.0.0 allows LAN access
- **Production deployment**: Use HTTPS and proper authentication
- **Database**: SQLite has no authentication; suitable for local use only

## 🚀 Deployment

### Local Network Access

To access from other devices on your network:

```python
# server.py already configured for this
uvicorn.run(app, host="0.0.0.0", port=5000)
```

Access via: `http://YOUR_LOCAL_IP:5000`

### Cloud Deployment (Example: Heroku)

1. Add `Procfile`:
```
web: uvicorn server:app --host 0.0.0.0 --port $PORT
```

2. Update `server.py` for dynamic port:
```python
import os
port = int(os.environ.get("PORT", 5000))
uvicorn.run(app, host="0.0.0.0", port=port)
```

3. Deploy:
```bash
heroku create
git push heroku main
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 🙏 Acknowledgments

- **Binance** for providing free market data APIs
- **FastAPI** for the excellent async framework
- **React** community for amazing frontend tools
- **Recharts** and **Plotly** for visualization libraries

## 🔮 Future Enhancements

- [ ] Add more exchanges (Coinbase, Kraken)
- [ ] Implement automated trading execution
- [ ] Add backtesting engine with historical data
- [ ] Support for traditional markets (stocks, forex)
- [ ] Mobile app version
- [ ] Advanced order types and risk management
- [ ] Portfolio optimization tools
- [ ] Machine learning signal generation
- [ ] Multi-timeframe analysis
- [ ] Email/SMS alert notifications

## ⚖️ Disclaimer

**This software is for educational and research purposes only.**

- Not financial advice
- No warranty or guarantee of accuracy
- Past performance does not indicate future results
- Cryptocurrency trading involves substantial risk of loss
- Use at your own risk

Always do your own research and consult with qualified financial advisors before making investment decisions.

---

**Built with ❤️ for quantitative traders**

*Star ⭐ this repo if you find it useful!*
