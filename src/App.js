import React, { useState, useEffect } from 'react';
import useWebSocket from 'react-use-websocket';
import Plot from 'react-plotly.js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

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

// Enhanced Dropdown Component
const EnhancedDropdown = ({ value, options, onChange, label, icon }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div style={{ position: 'relative', minWidth: '160px' }}>
      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 'bold', marginBottom: '4px', letterSpacing: '0.5px' }}>
        {label}
      </div>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: '#0f172a',
          border: '1px solid #475569',
          borderRadius: '6px',
          padding: '8px 12px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'all 0.2s',
          ...(isOpen && { borderColor: '#60a5fa', boxShadow: '0 0 0 2px rgba(96, 165, 250, 0.1)' })
        }}
      >
        <span style={{ color: '#fff', fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
          {icon && <span style={{ marginRight: '6px' }}>{icon}</span>}
          {value}
        </span>
        <span style={{ color: '#64748b', fontSize: '10px', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', marginLeft: '8px' }}>
          ▼
        </span>
      </div>
      
      {isOpen && (
        <>
          <div 
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
            onClick={() => setIsOpen(false)}
          />
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: '#1e293b',
            border: '1px solid #475569',
            borderRadius: '6px',
            maxHeight: '250px',
            overflowY: 'auto',
            overflowX: 'hidden',
            zIndex: 1000,
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)'
          }}>
            {options.map(opt => (
              <div
                key={opt}
                onClick={() => { onChange(opt); setIsOpen(false); }}
                style={{
                  padding: '10px 12px',
                  color: opt === value ? '#60a5fa' : '#e2e8f0',
                  background: opt === value ? 'rgba(96, 165, 250, 0.1)' : 'transparent',
                  cursor: 'pointer',
                  fontSize: '13px',
                  transition: 'all 0.15s',
                  borderLeft: opt === value ? '3px solid #60a5fa' : '3px solid transparent',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
                onMouseEnter={(e) => { if (opt !== value) e.target.style.background = '#334155'; }}
                onMouseLeave={(e) => { if (opt !== value) e.target.style.background = 'transparent'; }}
              >
                {opt}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// Fullscreen Chart Wrapper
const FullscreenChartWrapper = ({ title, children, helperText }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  return (
    <>
      <div style={{ 
        background: '#1e293b', 
        padding: '20px', 
        borderRadius: '12px', 
        minHeight: '300px',
        position: 'relative',
        ...(isFullscreen && {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9998,
          borderRadius: 0,
          minHeight: '100vh'
        })
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', color: '#94a3b8', fontWeight: '700', letterSpacing: '0.5px' }}>
              {title}
            </h3>
            {helperText && (
              <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#64748b', maxWidth: '600px' }}>
                {helperText}
              </p>
            )}
          </div>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            style={{
              background: '#334155',
              border: '1px solid #475569',
              borderRadius: '6px',
              padding: '6px 12px',
              color: '#e2e8f0',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => { e.target.style.background = '#475569'; }}
            onMouseLeave={(e) => { e.target.style.background = '#334155'; }}
          >
            {isFullscreen ? '✕ Exit Fullscreen' : '⛶ Fullscreen'}
          </button>
        </div>
        
        <div style={{ height: isFullscreen ? 'calc(100vh - 120px)' : '250px' }}>
          {children}
        </div>
      </div>
    </>
  );
};

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
    fetch('/symbols')
      .then(res => res.json())
      .then(data => { if(data.symbols) setAvailableSymbols(data.symbols); })
      .catch(e => console.error(e));
  }, []);

  // --- SOCKET ---
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socketUrl = `${wsProtocol}//${window.location.host}/ws?watchlist=${watchlist.join(',')}&primary=${primSym}&secondary=${secSym}&window=${windowSize}`;
  
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

  // --- CSV DOWNLOAD HANDLER ---
  const handleDownloadCsv = () => {
    const url = `/export_csv?primary=${primSym}&secondary=${secSym}&window=${windowSize}`;
    
    // Create hidden link and click it to trigger native download
    const link = document.createElement('a');
    link.href = url;
    link.download = `strategy_${primSym}_${secSym}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const windowOptions = ['15', '30', '60', '120', '300'];
  const windowLabels = { '15': '15 Minutes', '30': '30 Minutes', '60': '1 Hour', '120': '2 Hours', '300': '5 Hours' };

  return (
    <div style={{ padding: '20px', backgroundColor: '#0f172a', minHeight: '110vh', color: '#e2e8f0', fontFamily: 'Inter, sans-serif' }}>
      
      {(isLoading || readyState !== 1) && <GlobalLoadingOverlay />}

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #334155', paddingBottom: '20px' }}>
        
        {/* LEFT: TITLE & SYSTEM STATUS */}
        <div>
            <h1 style={{ margin: 0, fontSize: '24px', color: '#fff' }}>Quant Live Monitor</h1>
            <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                {readyState === 1 ? <span style={{color:'#4ade80'}}>● System Online</span> : <span style={{color:'#ef4444'}}>● Reconnecting...</span>}
                {latest.latency && <span style={{ background: '#334155', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>LATENCY: {latest.latency}</span>}
                {latest.timestamp && <span style={{ color: '#64748b', fontSize: '10px' }}>LAST UPDATE: {latest.timestamp}</span>}
            </div>
        </div>
        
        {/* RIGHT: CONTROL BAR */}
        <div style={{ background: '#1e293b', padding: '12px 20px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '20px', border: '1px solid #334155' }}>
            
            <EnhancedDropdown
              label="LOOKBACK PERIOD"
              value={windowLabels[windowSize.toString()]}
              options={windowOptions.map(w => windowLabels[w])}
              onChange={(val) => {
                const selected = Object.keys(windowLabels).find(key => windowLabels[key] === val);
                setWindowSize(Number(selected));
                setIsLoading(true);
              }}
              icon="⏱"
            />

            <div style={{ width: '1px', height: '35px', background: '#334155' }}></div>

            <EnhancedDropdown
              label="PRIMARY ASSET"
              value={primSym}
              options={availableSymbols}
              onChange={(val) => handleStrategyChange(true, val)}
            />

            <span style={{color: '#64748b', fontSize: '14px', fontWeight: 'bold'}}>vs</span>

            <EnhancedDropdown
              label="SECONDARY ASSET"
              value={secSym}
              options={availableSymbols}
              onChange={(val) => handleStrategyChange(false, val)}
            />

            {/* DOWNLOAD BUTTON */}
            <div style={{ width: '1px', height: '35px', background: '#334155' }}></div>
            <button 
                onClick={handleDownloadCsv}
                title="Download Data as CSV"
                style={{
                    background: '#0f172a', border: '1px solid #475569', color: '#cbd5e1', 
                    borderRadius: '6px', width: '40px', height: '40px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#60a5fa'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#475569'; e.currentTarget.style.color = '#cbd5e1'; }}
            >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
            </button>

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
            <div style={{ marginBottom: '20px' }}>
              <FullscreenChartWrapper 
                title="MARKET PRICES"
              >
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tickerHistory}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="timestamp" stroke="#64748b" tick={{fontSize: 10}} />
                        <YAxis stroke="#64748b" domain={['auto', 'auto']} tick={{fontSize: 10}} />
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '6px' }} />
                        <Legend wrapperStyle={{fontSize: '12px'}}/>
                        <Line type="monotone" dataKey={primSym.toLowerCase()} stroke="#3b82f6" dot={false} strokeWidth={2} isAnimationActive={false} />
                        <Line type="monotone" dataKey={secSym.toLowerCase()} stroke="#10b981" dot={false} strokeWidth={2} isAnimationActive={false} />
                    </LineChart>
                </ResponsiveContainer>
              </FullscreenChartWrapper>
            </div>

            {/* Z-SCORE CHART */}
            <FullscreenChartWrapper 
              title="SPREAD Z-SCORE (LIVE)"
            >
              <div style={{ display: 'flex', height: '100%', gap: '15px' }}>
                {/* Chart */}
                <div style={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={tickerHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis dataKey="timestamp" stroke="#64748b" tick={{fontSize: 10}} />
                          <YAxis stroke="#64748b" domain={[-5, 5]} ticks={[-4, -2, 0, 2, 4]} tick={{fontSize: 10}} />
                          <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '6px' }} />
                          <ReferenceLine y={alertThreshold} stroke="#ef4444" strokeDasharray="3 3" label={{ position: 'insideTopRight',  value: 'SHORT', fill: '#ef4444', fontSize: 10 }} />
                          <ReferenceLine y={-alertThreshold} stroke="#10b981" strokeDasharray="3 3" label={{ position: 'insideBottomRight', value: 'LONG',  fill: '#10b981', fontSize: 10 }} />
                          <Line type="monotone" dataKey="z_score" stroke="#f59e0b" dot={{r: 1}} strokeWidth={2} isAnimationActive={false} />
                      </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Control Panel on Right */}
                <div style={{ 
                  width: '160px',
                  minWidth: '160px',
                  background: '#0f172a', 
                  border: '1px solid #334155', 
                  borderRadius: '8px', 
                  padding: '15px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  flexShrink: 0
                }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                    ALERT THRESHOLD
                  </div>
                  
                  <input 
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={alertThreshold}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val >= 0 && val <= 5) {
                        setAlertThreshold(val);
                      }
                    }}
                    style={{
                      background: '#1e293b',
                      border: '2px solid #475569',
                      borderRadius: '6px',
                      padding: '12px',
                      color: '#f59e0b',
                      fontSize: '24px',
                      fontWeight: 'bold',
                      textAlign: 'center',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#60a5fa';
                      e.target.style.boxShadow = '0 0 0 2px rgba(96, 165, 250, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#475569';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                  
                  <div style={{ fontSize: '10px', color: '#64748b', textAlign: 'center', marginBottom: '10px' }}>
                    Range: 0.0 - 5.0
                  </div>

                  {/* Alert Status */}
                  <div style={{ 
                    padding: '10px',
                    borderRadius: '6px',
                    textAlign: 'center',
                    background: isAlertActive ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                    border: isAlertActive ? '1px solid #ef4444' : '1px solid #10b981',
                    transition: 'all 0.3s'
                  }}>
                    <div style={{ 
                      fontSize: '11px', 
                      fontWeight: 'bold',
                      color: isAlertActive ? '#ef4444' : '#10b981',
                      marginBottom: '4px'
                    }}>
                      {isAlertActive ? '⚠️ ALERT ACTIVE' : '✓ NORMAL'}
                    </div>
                    <div style={{ fontSize: '9px', color: '#94a3b8' }}>
                      Current Z: {currentZ.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </FullscreenChartWrapper>
        </div>

        {/* RIGHT COLUMN */}
        <div>
            <div style={{ background: '#1e293b', padding: '15px', borderRadius: '12px', marginBottom: '20px', textAlign: 'center' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#94a3b8', fontSize: '12px', letterSpacing: '0.5px' }}>CORRELATION MATRIX</h4>
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
                 <h4 style={{ margin: '0 0 10px 0', color: '#94a3b8', fontSize: '12px', letterSpacing: '0.5px' }}>ROLLING CORRELATION ({windowSize}m)</h4>
                 <ResponsiveContainer width="100%" height={100}>
                    <LineChart data={tickerHistory}>
                        <YAxis domain={[-1, 1]} hide />
                        <ReferenceLine y={0.8} stroke="#ef4444" strokeDasharray="3 3"/>
                        <Line type="monotone" dataKey="rolling_corr" stroke="#8b5cf6" dot={false} strokeWidth={2} isAnimationActive={false} />
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