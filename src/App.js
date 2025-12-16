import React, { useState, useEffect } from 'react';
import useWebSocket from 'react-use-websocket';
import Plot from 'react-plotly.js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

const PAIR_COLORS = ['#3b82f6', '#10b981']; 

// --- COMPONENTS ---

const GlobalLoadingOverlay = () => (
  <div style={{
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15, 23, 42, 0.9)', 
    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    zIndex: 9999, backdropFilter: 'blur(5px)'
  }}>
    <div style={{
      border: '4px solid #334155', borderTop: '4px solid #3b82f6', borderRadius: '50%',
      width: '50px', height: '50px', animation: 'spin 0.8s linear infinite'
    }} />
    <h3 style={{ marginTop: '20px', color: '#fff', fontSize: '18px', fontWeight: '600' }}>
      Recalculating Strategy...
    </h3>
    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
  </div>
);

const MetricCard = ({ label, value, subtext, color = '#fff' }) => (
    <div style={{ background: '#1e293b', padding: '15px', borderRadius: '10px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{label}</span>
        <div style={{ fontSize: '22px', fontWeight: 'bold', color: color, marginTop: '5px' }}>
            {value}
        </div>
        {subtext && <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{subtext}</div>}
    </div>
);

// --- MAIN APP ---

function App() {
  const [availableSymbols, setAvailableSymbols] = useState([]); 
  const [watchlist, setWatchlist] = useState(['BTCUSDT', 'ETHUSDT']); 
  const [primSym, setPrimSym] = useState('BTCUSDT');
  const [secSym, setSecSym] = useState('ETHUSDT');
  const [tickerHistory, setTickerHistory] = useState([]);
  const [heatmap, setHeatmap] = useState({ z: [], x: [], y: [] });
  
  // USER CONTROLS
  const [alertThreshold, setAlertThreshold] = useState(2.0);
  const [windowSize, setWindowSize] = useState(30); 
  
  const [isLoading, setIsLoading] = useState(true);

  // --- SETUP ---
  useEffect(() => {
    fetch('http://localhost:5000/symbols')
      .then(res => res.json())
      .then(data => { if(data.symbols) setAvailableSymbols(data.symbols); })
      .catch(e => console.error(e));
  }, []);

  // --- SOCKET ---
  const socketUrl = `ws://localhost:5000/ws?watchlist=${watchlist.join(',')}&primary=${primSym}&secondary=${secSym}&window=${windowSize}`;
  
  const { lastJsonMessage, readyState } = useWebSocket(socketUrl, {
    shouldReconnect: () => true,
    reconnectAttempts: 10,
  });

  const handleStrategyChange = (isPrimary, symbol) => {
    setTickerHistory([]); 
    setIsLoading(true); 
    const newPrim = isPrimary ? symbol : primSym;
    const newSec = !isPrimary ? symbol : secSym;
    setPrimSym(newPrim);
    setSecSym(newSec);
    setWatchlist([newPrim, newSec]);
  };

  // --- DATA HANDLING ---
  useEffect(() => {
    if (lastJsonMessage) {
      const { type, data } = lastJsonMessage;
      if (type === 'history_batch') {
        setTickerHistory(data);
        setIsLoading(false);
      }
      else if (type === 'live_update') {
        const { timestamp, prices, z_score, rolling_corr, beta, heatmap, half_life, latency } = data;
        if (tickerHistory.length > 0) setIsLoading(false);
        setTickerHistory(prev => {
          const newData = [...prev];
          const newPoint = { timestamp, z_score, rolling_corr, beta, half_life, latency, ...prices };
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

  const latest = tickerHistory.length > 0 ? tickerHistory[tickerHistory.length - 1] : {};
  const currentZ = latest.z_score || 0;
  const isAlertActive = Math.abs(currentZ) > alertThreshold;

  return (
    <div style={{ padding: '20px', backgroundColor: '#0f172a', minHeight: '100vh', color: '#e2e8f0', fontFamily: 'Inter, sans-serif' }}>
      
      {(isLoading || readyState !== 1) && <GlobalLoadingOverlay />}

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '20px' }}>
        
        {/* LEFT: TITLE & SYSTEM STATUS */}
        <div>
            <h1 style={{ margin: 0, fontSize: '24px', color: '#fff' }}>Quant Live Monitor</h1>
            <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '10px' }}>
                {readyState === 1 ? <span style={{color:'#4ade80'}}>● System Online</span> : <span style={{color:'#ef4444'}}>● Reconnecting...</span>}
                {latest.latency && <span style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>LATENCY: {latest.latency}</span>}
                {latest.timestamp && <span style={{ color: '#64748b', fontSize: '10px' }}>LAST UPDATE: {latest.timestamp}</span>}
            </div>
        </div>
        
        {/* RIGHT: CONTROL BAR */}
        <div style={{ background: '#1e293b', padding: '8px 15px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '15px', border: '1px solid #334155' }}>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold' }}>LOOKBACK PERIOD</span>
                <select 
                  value={windowSize} 
                  onChange={(e) => { setWindowSize(Number(e.target.value)); setIsLoading(true); }}
                  style={{ background: 'transparent', color: '#60a5fa', border: 'none', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', textAlign: 'right', outline: 'none' }}>
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>1 Hour</option>
                  <option value={120}>2 Hours</option>
                  <option value={300}>5 Hours</option>
                </select>
            </div>

            <div style={{ width: '1px', height: '25px', background: '#334155' }}></div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select value={primSym} onChange={(e) => handleStrategyChange(true, e.target.value)}
                    style={{ background: '#0f172a', color: 'white', border: '1px solid #475569', padding: '5px', borderRadius: '4px', fontSize: '12px' }}>
                    {availableSymbols.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span style={{color: '#64748b', fontSize: '12px'}}>vs</span>
                <select value={secSym} onChange={(e) => handleStrategyChange(false, e.target.value)}
                    style={{ background: '#0f172a', color: 'white', border: '1px solid #475569', padding: '5px', borderRadius: '4px', fontSize: '12px' }}>
                    {availableSymbols.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>

        </div>
      </div>

      {/* SUMMARY METRICS ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
        <MetricCard 
            label="Current Z-Score" 
            value={currentZ.toFixed(2)} 
            color={Math.abs(currentZ) > alertThreshold ? '#ef4444' : '#fff'}
            subtext={Math.abs(currentZ) > alertThreshold ? "SIGNAL ACTIVE" : "Neutral Zone"}
        />
        <MetricCard 
            label="Mean Rev. Half-Life" 
            value={latest.half_life ? latest.half_life + ' min' : '-'} 
            color="#3b82f6"
            subtext="Est. holding period"
        />
        <MetricCard 
            label={`Hedge Beta (${windowSize}m)`} 
            value={latest.beta ? latest.beta.toFixed(3) : '-'} 
            color="#10b981"
            subtext="Rolling OLS Slope"
        />
        <MetricCard 
            label={`Correlation (${windowSize}m)`} 
            value={latest.rolling_corr ? latest.rolling_corr.toFixed(2) : '-'} 
            color={latest.rolling_corr < 0.8 ? '#f59e0b' : '#fff'}
            subtext="Critical < 0.80"
        />
      </div>

      {/* MAIN CONTENT GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '20px' }}>
        
        {/* LEFT COLUMN: CHARTS */}
        <div>
            {/* PRICE CHART */}
            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', marginBottom: '20px', minHeight: '300px' }}>
                <h3 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#94a3b8' }}>MARKET PRICES</h3>
                <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={tickerHistory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="timestamp" stroke="#64748b" tick={{fontSize: 10}} />
                        <YAxis stroke="#64748b" domain={['auto', 'auto']} tick={{fontSize: 10}} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                        <Legend wrapperStyle={{fontSize: '12px'}}/>
                        <Line type="monotone" dataKey={primSym.toLowerCase()} stroke="#3b82f6" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey={secSym.toLowerCase()} stroke="#10b981" dot={false} strokeWidth={2} />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Z-SCORE CHART WITH DRAGGABLE SLIDER */}
            <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', minHeight: '300px', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <h3 style={{ margin: 0, fontSize: '14px', color: '#94a3b8' }}>SPREAD Z-SCORE (LIVE)</h3>
                    <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
                        Alert Threshold: <strong style={{color: '#f59e0b'}}>±{alertThreshold.toFixed(1)}</strong>
                    </div>
                </div>

                <div style={{ position: 'relative', height: '250px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={tickerHistory}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                            <XAxis dataKey="timestamp" stroke="#64748b" tick={{fontSize: 10}} />
                            <YAxis stroke="#64748b" domain={[-5, 5]} ticks={[-4, -2, 0, 2, 4]} tick={{fontSize: 10}} />
                            <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                            <ReferenceLine y={alertThreshold} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'insideTopRight',  value: 'SHORT', fill: '#ef4444', fontSize: 10 }} />
                            <ReferenceLine y={-alertThreshold} stroke="#10b981" strokeDasharray="3 3" label={{ position: 'insideBottomRight', value: 'LONG',  fill: '#10b981', fontSize: 10 }} />
                            <Line type="monotone" dataKey="z_score" stroke="#f59e0b" dot={{r: 1}} strokeWidth={2} animationDuration={300} />
                        </LineChart>
                    </ResponsiveContainer>

                    <div style={{ 
                        position: 'absolute', right: '-25px', top: '10px', bottom: '30px', 
                        display: 'flex', alignItems: 'center' 
                    }}>
                        <input 
                            type="range" min="0" max="5" step="0.1" 
                            value={alertThreshold} 
                            onChange={(e) => setAlertThreshold(Number(e.target.value))}
                            style={{ 
                                writingMode: 'bt-lr', appearance: 'slider-vertical', 
                                width: '8px', height: '100%', background: '#334155', cursor: 'ns-resize'
                            }} 
                            title="Drag to adjust alert threshold"
                        />
                    </div>
                </div>
            </div>
        </div>

        {/* RIGHT COLUMN */}
        <div>
            {isAlertActive && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', padding: '15px', borderRadius: '12px', marginBottom: '20px', color: '#fca5a5', animation: 'pulse 2s infinite' }}>
                    <div style={{display:'flex', alignItems:'center', gap: '10px'}}>
                        <span style={{fontSize: '20px'}}>🚨</span>
                        <div><strong>ACTION REQUIRED</strong><br/><span style={{fontSize: '12px'}}>Deviation &gt {alertThreshold}</span></div>
                    </div>
                </div>
            )}
            <style>{`@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.7; } 100% { opacity: 1; } }`}</style>

            <div style={{ background: '#1e293b', padding: '15px', borderRadius: '12px', marginBottom: '20px', textAlign: 'center' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#94a3b8', fontSize: '12px' }}>CORRELATION MATRIX</h4>
                <div style={{display: 'flex', justifyContent: 'center'}}>
                    <Plot
                        data={[{
                            z: heatmap.z, x: heatmap.x, y: heatmap.y,
                            type: 'heatmap', colorscale: 'Viridis', showscale: false
                        }]}
                        layout={{
                            width: 220, height: 220,
                            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                            margin: {t:0, l:25, r:0, b:25}, font: {color: '#64748b', size: 9}
                        }}
                        config={{displayModeBar: false}}
                    />
                </div>
            </div>

            {/* ADVANCED STATS MINI-CHARTS */}
            <div style={{ background: '#1e293b', padding: '15px', borderRadius: '12px' }}>
                 <h4 style={{ margin: '0 0 10px 0', color: '#94a3b8', fontSize: '12px' }}>ROLLING CORRELATION ({windowSize}m)</h4>
                 <ResponsiveContainer width="100%" height={100}>
                    <LineChart data={tickerHistory}>
                        <YAxis domain={[-1, 1]} hide />
                        <ReferenceLine y={0.8} stroke="#ef4444" strokeDasharray="3 3"/>
                        <Line type="monotone" dataKey="rolling_corr" stroke="#8b5cf6" dot={false} strokeWidth={2} />
                        <Tooltip cursor={false} contentStyle={{display:'none'}}/>
                    </LineChart>
                 </ResponsiveContainer>
                 <div style={{textAlign:'right', fontSize:'10px', color: latest.rolling_corr < 0.8 ? '#ef4444' : '#10b981'}}>
                    {latest.rolling_corr < 0.8 ? '⚠️ Correlation Breakdown' : '✅ Stable Relation'}
                 </div>
            </div>
        </div>
      </div>
    </div>
  );
}

export default App;