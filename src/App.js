import React, { useState, useEffect } from 'react';
import useWebSocket from 'react-use-websocket';
import Plot from 'react-plotly.js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

const PAIR_COLORS = ['#3b82f6', '#10b981']; 

// 1. UPDATED: Full Screen Global Loader
const GlobalLoadingOverlay = () => (
  <div style={{
    position: 'fixed', // Covers entire window
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15, 23, 42, 0.85)', // Dark semi-transparent
    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    zIndex: 9999, backdropFilter: 'blur(5px)'
  }}>
    <div style={{
      border: '4px solid #334155', borderTop: '4px solid #3b82f6', borderRadius: '50%',
      width: '50px', height: '50px', animation: 'spin 0.8s linear infinite'
    }} />
    <h3 style={{ marginTop: '20px', color: '#fff', fontSize: '18px', fontWeight: '600' }}>
      Switching Market Context...
    </h3>
    <span style={{ color: '#94a3b8', fontSize: '14px' }}>
      Synchronizing historical data & correlation matrix
    </span>
    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
  </div>
);

function App() {
  const [availableSymbols, setAvailableSymbols] = useState([]); 
  const [watchlist, setWatchlist] = useState(['BTCUSDT', 'ETHUSDT']); 
  
  const [primSym, setPrimSym] = useState('BTCUSDT');
  const [secSym, setSecSym] = useState('ETHUSDT');

  const [tickerHistory, setTickerHistory] = useState([]);
  const [heatmap, setHeatmap] = useState({ z: [], x: [], y: [] });
  const [alertThreshold, setAlertThreshold] = useState(2.0);
  const [isLoading, setIsLoading] = useState(true);

  // --- SETUP ---
  useEffect(() => {
    fetch('http://localhost:5000/symbols')
      .then(res => res.json())
      .then(data => { if(data.symbols) setAvailableSymbols(data.symbols); })
      .catch(e => console.error(e));
  }, []);

  // --- SOCKET ---
  const socketUrl = `ws://localhost:5000/ws?watchlist=${watchlist.join(',')}&primary=${primSym}&secondary=${secSym}`;
  
  const { lastJsonMessage, readyState } = useWebSocket(socketUrl, {
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    onOpen: () => console.log("WS Connected"),
  });

  // --- 2. UPDATED: Cleaner Strategy Change Logic ---
  const handleStrategyChange = (isPrimary, symbol) => {
    setTickerHistory([]); 
    setIsLoading(true); // Trigger Global Loader
    
    // Determine the new pair
    const newPrim = isPrimary ? symbol : primSym;
    const newSec = !isPrimary ? symbol : secSym;

    setPrimSym(newPrim);
    setSecSym(newSec);
    
    // FIX: RESET watchlist to ONLY these two (Prevents Heatmap from growing indefinitely)
    setWatchlist([newPrim, newSec]);
  };

  // --- DATA HANDLING ---
  useEffect(() => {
    if (lastJsonMessage) {
      const { type, data } = lastJsonMessage;

      if (type === 'history_batch') {
        setTickerHistory(data);
        setIsLoading(false); // Data loaded, remove overlay
      }
      else if (type === 'live_update') {
        const { timestamp, prices, z_score, heatmap } = data;
        
        // Safety: Only turn off loader if we actually have data points
        if (tickerHistory.length > 0) setIsLoading(false);

        setTickerHistory(prev => {
          const newData = [...prev];
          const newPoint = { timestamp, z_score, ...prices };
          
          if (newData.length > 0 && newData[newData.length - 1].timestamp === timestamp) {
            newData[newData.length - 1] = newPoint;
          } else {
            newData.push(newPoint);
            if (newData.length > 60) newData.shift();
          }
          return newData;
        });

        if (heatmap?.z?.length > 0) setHeatmap(heatmap);
      }
    }
  }, [lastJsonMessage, tickerHistory.length]);

  const currentZ = tickerHistory.length > 0 ? tickerHistory[tickerHistory.length - 1].z_score : 0;
  const isAlertActive = Math.abs(currentZ) > alertThreshold;

  return (
    <div style={{ padding: '20px', backgroundColor: '#0f172a', minHeight: '100vh', color: '#e2e8f0', fontFamily: 'Inter, sans-serif' }}>
      
      {/* 3. RENDER GLOBAL LOADER */}
      {(isLoading || readyState !== 1) && <GlobalLoadingOverlay />}

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', borderBottom: '1px solid #334155', paddingBottom: '20px' }}>
        <div>
            <h1 style={{ margin: 0, fontSize: '24px', color: '#fff' }}>Quant Live Monitor</h1>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                {readyState === 1 ? <span style={{color:'#4ade80'}}>● System Online</span> : <span style={{color:'#ef4444'}}>● Reconnecting...</span>}
            </div>
        </div>
        
        <div style={{ background: '#1e293b', padding: '10px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '15px', border: '1px solid #334155' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#60a5fa' }}>SELECT PAIR:</span>
            <select 
                value={primSym} 
                onChange={(e) => handleStrategyChange(true, e.target.value)}
                style={{ background: '#0f172a', color: 'white', border: '1px solid #475569', padding: '5px', borderRadius: '4px', width: '120px' }}>
                {availableSymbols.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span style={{color: '#64748b'}}>vs</span>
            <select 
                value={secSym} 
                onChange={(e) => handleStrategyChange(false, e.target.value)}
                style={{ background: '#0f172a', color: 'white', border: '1px solid #475569', padding: '5px', borderRadius: '4px', width: '120px' }}>
                {availableSymbols.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '20px' }}>
        
        {/* LEFT COLUMN */}
        <div>
            {/* MARKET CHART */}
            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', marginBottom: '20px', minHeight: '340px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#f8fafc' }}>
                    Market Overview: {primSym} vs {secSym}
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={tickerHistory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="timestamp" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" domain={['auto', 'auto']} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} itemStyle={{ textTransform: 'uppercase' }} />
                        <Legend />
                        {[primSym, secSym].map((s, i) => (
                            <Line 
                                key={s} 
                                type="monotone" 
                                dataKey={s.toLowerCase()} 
                                name={s} 
                                stroke={PAIR_COLORS[i % 2]} 
                                dot={false} 
                                strokeWidth={2} 
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Z-SCORE CHART */}
            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', minHeight: '300px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#f8fafc' }}>Spread Z-Score</h3>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', color: isAlertActive ? '#ef4444' : '#10b981' }}>
                        Current Z: {currentZ ? currentZ.toFixed(2) : '0.00'}
                    </span>
                </div>
                <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={tickerHistory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="timestamp" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                        <ReferenceLine y={alertThreshold} stroke="#ef4444" strokeDasharray="3 3" label="SELL" />
                        <ReferenceLine y={-alertThreshold} stroke="#10b981" strokeDasharray="3 3" label="BUY" />
                        <Line type="monotone" dataKey="z_score" stroke="#f59e0b" dot={{r: 1}} strokeWidth={2} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* RIGHT COLUMN */}
        <div>
            {isAlertActive && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '15px', borderRadius: '12px', marginBottom: '20px', color: '#fca5a5' }}>
                    <strong>🚨 SIGNAL ALERT</strong><br/>
                    Significant deviation detected.
                </div>
            )}

            <div style={{ background: '#1e293b', padding: '15px', borderRadius: '12px', marginBottom: '20px', textAlign: 'center' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#cbd5e1', fontSize: '14px' }}>Correlation Heatmap</h4>
                <div style={{display: 'flex', justifyContent: 'center'}}>
                    <Plot
                        data={[{
                            z: heatmap.z,
                            x: heatmap.x,
                            y: heatmap.y,
                            type: 'heatmap',
                            colorscale: 'Viridis',
                            showscale: false
                        }]}
                        layout={{
                            width: 220, height: 220,
                            paper_bgcolor: 'rgba(0,0,0,0)',
                            plot_bgcolor: 'rgba(0,0,0,0)',
                            margin: {t:0, l:25, r:0, b:25},
                            font: {color: '#64748b', size: 9}
                        }}
                        config={{displayModeBar: false}}
                    />
                </div>
            </div>

            <div style={{ background: '#1e293b', padding: '15px', borderRadius: '12px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8' }}>Alert Threshold</label>
                <input 
                    type="number" 
                    step="0.1"
                    value={alertThreshold} 
                    onChange={e => setAlertThreshold(Number(e.target.value))}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', color: 'white', padding: '8px', marginTop: '5px', marginRight: '5px', borderRadius: '6px' }}
                />
            </div>
        </div>

      </div>
    </div>
  );
}

export default App;