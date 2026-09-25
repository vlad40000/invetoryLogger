import { useState, useEffect } from 'react';
import { AndroidDevice } from './components/AndroidFrame';

type Screen = 'setup' | 'list' | 'camera' | 'extracting' | 'confirm';

interface ApplianceRecord {
  no: number;
  brand: string;
  model: string;
  serial: string;
  type: string;
  color: string;
  notes: string;
  timestamp: Date;
}

interface DraftRecord {
  brand: string;
  model: string;
  serial: string;
  type: string;
  color: string;
  notes: string;
}

const COLORS = ['White', 'Black', 'Stainless', 'Bisque', 'Almond', 'Other'];
const COLOR_HEX: Record<string, string> = {
  White: '#F8F8F6',
  Black: '#1A1A1A',
  Stainless: '#B8B4AE',
  Bisque: '#E8D5C0',
  Almond: '#D4C4A8',
  Other: '#DAD6CC',
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [batchName, setBatchName] = useState('Riverbend Apartments');
  const [startNumber, setStartNumber] = useState(101);
  const [records, setRecords] = useState<ApplianceRecord[]>([]);
  const [flashOn, setFlashOn] = useState(false);
  const [draft, setDraft] = useState<DraftRecord>({
    brand: '', model: '', serial: '', type: 'Refrigerator', color: 'White', notes: ''
  });
  const [capturedBrand, setCapturedBrand] = useState('');
  const [capturedModel, setCapturedModel] = useState('');
  const [capturedSerial, setCapturedSerial] = useState('');
  const [hasPhoto, setHasPhoto] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedRecord, setExpandedRecord] = useState<number | null>(null);
  const [confirmSheet, setConfirmSheet] = useState(false);
  const [extractStep, setExtractStep] = useState(0);

  const nextNumber = startNumber + records.length;

  useEffect(() => {
    if (screen === 'extracting') {
      setExtractStep(0);
      const t1 = setTimeout(() => setExtractStep(1), 400);
      const t2 = setTimeout(() => setExtractStep(2), 900);
      const t3 = setTimeout(() => setExtractStep(3), 1400);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
  }, [screen]);

  const beginBatch = () => setScreen('list');

  const openCamera = () => {
    setHasPhoto(false);
    setScreen('camera');
  };

  const openManual = () => {
    setDraft({ brand: '', model: '', serial: '', type: 'Refrigerator', color: 'White', notes: '' });
    setCapturedBrand(''); setCapturedModel(''); setCapturedSerial('');
    setHasPhoto(false);
    setScreen('confirm');
  };

  const shoot = () => {
    const brands = ['Whirlpool', 'Samsung', 'LG', 'GE', 'Frigidaire', 'Maytag'];
    const brand = brands[Math.floor(Math.random() * brands.length)];
    const model = 'WRS' + Math.floor(Math.random() * 90000 + 10000);
    const serial = 'SN' + Math.floor(Math.random() * 9000000000 + 1000000000);
    setCapturedBrand(brand); setCapturedModel(model); setCapturedSerial(serial);
    setScreen('extracting');
    setTimeout(() => {
      setDraft({ brand, model, serial, type: 'Refrigerator', color: 'White', notes: '' });
      setHasPhoto(true);
      setScreen('confirm');
    }, 2200);
  };

  const saveRecord = () => {
    const newRecord: ApplianceRecord = { no: nextNumber, ...draft, timestamp: new Date() };
    setRecords([...records, newRecord]);
    setExpandedRecord(null);
    setScreen('list');
  };

  const exportToCSV = () => {
    let csv = 'No,Brand,Type,Model,Serial,Color,Notes,Time\n';
    records.forEach(r => {
      const t = r.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      csv += `${r.no},"${r.brand}","${r.type}","${r.model}","${r.serial}","${r.color}","${r.notes}","${t}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${batchName.replace(/\s+/g, '_')}_inventory.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };

  const initiateNewBatch = () => { setMenuOpen(false); setConfirmSheet(true); };
  const confirmNewBatch = () => { setRecords([]); setScreen('setup'); setConfirmSheet(false); };

  const isSaveable = draft.brand.trim() && draft.model.trim() && draft.serial.trim();

  const stepDot = (step: number, label: string) => {
    const done = extractStep > step;
    const active = extractStep === step;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: `500 10px/1 'IBM Plex Mono'`, color: done ? '#4ADE80' : active ? '#E8472C' : '#cfc7b8', letterSpacing: '.1em', transition: 'color 0.3s' }}>
        <div style={{ width: 6, height: 6, background: done ? '#4ADE80' : active ? '#E8472C' : 'rgba(255,255,255,.2)', borderRadius: '50%', transition: 'background 0.3s', boxShadow: active ? '0 0 6px #E8472C' : 'none' }}></div>
        {label}
      </div>
    );
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', background: '#E5E2DA',
      fontFamily: "'IBM Plex Sans', system-ui, sans-serif"
    }}>
      <AndroidDevice width={412} height={892}>
        <div style={{
          position: 'relative', height: '100%', width: '100%',
          background: '#F4F2ED', overflow: 'hidden',
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif"
        }}>

          {/* SETUP */}
          {screen === 'setup' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#F4F2ED' }}>
              <div style={{ padding: '32px 24px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ width: 16, height: 16, background: '#E8472C' }}></div>
                  <div style={{ font: "600 11px/1 'IBM Plex Sans'", letterSpacing: '.18em', textTransform: 'uppercase', color: '#0F0F0E' }}>Field Capture</div>
                </div>
                <div style={{ font: "600 30px/1.05 'IBM Plex Sans'", letterSpacing: '-.01em', color: '#0F0F0E', marginTop: 18 }}>Inventory<br />Logger</div>
                <div style={{ font: "400 14px/1.5 'IBM Plex Sans'", color: '#57544D', marginTop: 10, maxWidth: 300 }}>Photograph appliance nameplates. Extract brand, model, serial. Export to spreadsheet.</div>
              </div>

              <div style={{ padding: '36px 24px 0', flex: 1, overflow: 'auto' }}>
                <div style={{ font: "600 10px/1 'IBM Plex Sans'", letterSpacing: '.16em', textTransform: 'uppercase', color: '#0F0F0E', marginBottom: 10 }}>▌ Batch name</div>
                <input type="text" value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="e.g. Riverbend Apartments"
                  style={{ width: '100%', background: '#FFFFFF', border: '1px solid #0F0F0E', padding: '14px 14px', font: "500 16px/1.2 'IBM Plex Sans'", color: '#0F0F0E', borderRadius: 0, boxSizing: 'border-box' }} />

                <div style={{ font: "600 10px/1 'IBM Plex Sans'", letterSpacing: '.16em', textTransform: 'uppercase', color: '#0F0F0E', margin: '24px 0 10px' }}>▌ Starting unit number</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                  <input type="number" value={startNumber} onChange={(e) => setStartNumber(parseInt(e.target.value) || 0)}
                    style={{ width: 120, background: '#FFFFFF', border: '1px solid #0F0F0E', padding: 14, font: "500 18px/1.2 'IBM Plex Mono'", color: '#0F0F0E', borderRadius: 0 }} />
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 4px', font: "400 12px/1.4 'IBM Plex Sans'", color: '#57544D' }}>Sequence counts up automatically. Change anytime from the menu.</div>
                </div>

                <div style={{ background: '#FFFFFF', border: '1px solid #DAD6CC', padding: 16, marginTop: 28 }}>
                  <div style={{ font: "600 10px/1 'IBM Plex Sans'", letterSpacing: '.16em', textTransform: 'uppercase', color: '#57544D', marginBottom: 10 }}>How it works</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[['1','Photograph the nameplate'],['2','Confirm brand, model, serial'],['3','Pick color, appliance type, notes'],['→','Save. Counter advances. Export anytime.']].map(([n, t]) => (
                      <div key={n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ width: 18, height: 18, background: n === '→' ? '#E8472C' : '#0F0F0E', color: '#FFFFFF', font: `600 11px/18px 'IBM Plex Mono'`, textAlign: 'center', flexShrink: 0 }}>{n}</div>
                        <div style={{ font: "400 13px/1.4 'IBM Plex Sans'", color: '#0F0F0E' }}>{t}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ padding: '16px 24px 28px' }}>
                <button onClick={beginBatch}
                  style={{ width: '100%', background: '#0F0F0E', color: '#FFFFFF', padding: 20, font: "600 13px/1 'IBM Plex Sans'", letterSpacing: '.16em', textTransform: 'uppercase', borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', border: 'none' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#E8472C'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#0F0F0E'}>
                  <span>Begin inventory</span>
                  <span style={{ font: "600 16px/1 'IBM Plex Mono'" }}>→</span>
                </button>
              </div>
            </div>
          )}

          {/* LIST */}
          {screen === 'list' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#F4F2ED' }}>
              <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #0F0F0E', background: '#F4F2ED' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ font: "600 10px/1 'IBM Plex Sans'", letterSpacing: '.18em', textTransform: 'uppercase', color: '#57544D' }}>Batch</div>
                  <button onClick={() => setMenuOpen(!menuOpen)}
                    style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ width: 4, height: 4, background: '#0F0F0E' }}></div>
                      <div style={{ width: 4, height: 4, background: '#0F0F0E' }}></div>
                      <div style={{ width: 4, height: 4, background: '#0F0F0E' }}></div>
                    </div>
                  </button>
                </div>
                <div style={{ font: "600 22px/1.1 'IBM Plex Sans'", letterSpacing: '-.01em', color: '#0F0F0E', marginTop: 4 }}>{batchName}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ font: "600 18px/1 'IBM Plex Mono'", color: '#0F0F0E' }}>{records.length}</span>
                    <span style={{ font: "400 11px/1 'IBM Plex Sans'", letterSpacing: '.14em', textTransform: 'uppercase', color: '#57544D' }}>records</span>
                  </div>
                  <div style={{ width: 1, height: 12, background: '#DAD6CC' }}></div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ font: "400 11px/1 'IBM Plex Sans'", letterSpacing: '.14em', textTransform: 'uppercase', color: '#57544D' }}>next</span>
                    <span style={{ font: "600 18px/1 'IBM Plex Mono'", color: '#0F0F0E' }}>#{nextNumber}</span>
                  </div>
                </div>
              </div>

              {menuOpen && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }} onClick={() => setMenuOpen(false)}>
                  <div style={{ position: 'absolute', top: 60, right: 20, background: '#FFFFFF', border: '1px solid #0F0F0E', minWidth: 200 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={exportToCSV} disabled={records.length === 0}
                      style={{ width: '100%', padding: '14px 16px', textAlign: 'left', font: "500 14px/1.2 'IBM Plex Sans'", color: records.length === 0 ? '#AAA' : '#0F0F0E', background: 'none', border: 'none', borderBottom: '1px solid #DAD6CC', cursor: records.length === 0 ? 'not-allowed' : 'pointer' }}>
                      Export to CSV{records.length > 0 ? ` (${records.length})` : ''}
                    </button>
                    <button onClick={initiateNewBatch}
                      style={{ width: '100%', padding: '14px 16px', textAlign: 'left', font: "500 14px/1.2 'IBM Plex Sans'", color: '#E8472C', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Start New Batch
                    </button>
                  </div>
                </div>
              )}

              <div style={{ flex: 1, overflow: 'auto' }}>
                {records.length === 0 ? (
                  <div style={{ padding: '48px 24px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    <div style={{ width: 120, height: 120, border: '2px dashed #0F0F0E', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
                      <div style={{ position: 'absolute', top: -2, left: -2, width: 18, height: 18, borderTop: '3px solid #E8472C', borderLeft: '3px solid #E8472C' }}></div>
                      <div style={{ position: 'absolute', top: -2, right: -2, width: 18, height: 18, borderTop: '3px solid #E8472C', borderRight: '3px solid #E8472C' }}></div>
                      <div style={{ position: 'absolute', bottom: -2, left: -2, width: 18, height: 18, borderBottom: '3px solid #E8472C', borderLeft: '3px solid #E8472C' }}></div>
                      <div style={{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderBottom: '3px solid #E8472C', borderRight: '3px solid #E8472C' }}></div>
                      <div style={{ font: "600 11px/1.3 'IBM Plex Mono'", color: '#57544D', textAlign: 'center' }}>NAME<br />PLATE</div>
                    </div>
                    <div style={{ font: "600 16px/1.3 'IBM Plex Sans'", color: '#0F0F0E', maxWidth: 240 }}>Ready to log the first unit</div>
                    <div style={{ font: "400 13px/1.4 'IBM Plex Sans'", color: '#57544D', marginTop: 8, maxWidth: 260 }}>Counter starts at <span style={{ font: "500 13px/1.4 'IBM Plex Mono'" }}>#{nextNumber}</span>. Tap capture below to photograph a nameplate.</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 80px', gap: 10, padding: '8px 20px', font: "600 10px/1 'IBM Plex Sans'", letterSpacing: '.14em', textTransform: 'uppercase', color: '#57544D', background: '#ECE9E0', borderBottom: '1px solid #DAD6CC' }}>
                      <div>No.</div><div>Appliance · Model</div><div style={{ textAlign: 'right' }}>Color</div>
                    </div>
                    {records.map((r) => {
                      const isExpanded = expandedRecord === r.no;
                      const t = r.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                      return (
                        <div key={r.no}>
                          <div onClick={() => setExpandedRecord(isExpanded ? null : r.no)}
                            style={{ display: 'grid', gridTemplateColumns: '44px 1fr 80px', gap: 10, padding: '12px 20px', borderBottom: isExpanded ? 'none' : '1px solid #DAD6CC', background: '#FFFFFF', cursor: 'pointer' }}>
                            <div style={{ font: "600 14px/1.2 'IBM Plex Mono'", color: '#0F0F0E' }}>#{r.no}</div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ font: "500 13px/1.3 'IBM Plex Sans'", color: '#0F0F0E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.brand} · {r.type}</div>
                              <div style={{ font: "400 12px/1.3 'IBM Plex Mono'", color: '#57544D', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.model}</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <div style={{ width: 10, height: 10, background: COLOR_HEX[r.color] || '#DAD6CC', border: '1px solid rgba(0,0,0,.15)', borderRadius: 2, flexShrink: 0 }}></div>
                                <div style={{ font: "600 9px/1 'IBM Plex Sans'", letterSpacing: '.08em', textTransform: 'uppercase', color: '#0F0F0E' }}>{r.color}</div>
                              </div>
                              <div style={{ font: "400 9px/1 'IBM Plex Mono'", color: '#C0BCB4' }}>{isExpanded ? '▲' : '▼'}</div>
                            </div>
                          </div>
                          {isExpanded && (
                            <div style={{ background: '#F8F7F3', borderBottom: '1px solid #DAD6CC', padding: '0 20px 14px 20px' }}>
                              <div style={{ borderTop: '1px solid #ECE9E0', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <DetailRow label="Serial" value={r.serial} mono />
                                <DetailRow label="Model" value={r.model} mono />
                                {r.notes ? <DetailRow label="Notes" value={r.notes} /> : null}
                                <div style={{ font: "400 10px/1 'IBM Plex Mono'", color: '#C0BCB4', letterSpacing: '.06em', marginTop: 4 }}>logged {t}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ padding: '14px 20px 20px', background: '#F4F2ED', borderTop: '1px solid #DAD6CC' }}>
                <button onClick={openCamera}
                  style={{ width: '100%', background: '#0F0F0E', color: '#FFFFFF', padding: 0, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, borderRadius: 0, cursor: 'pointer', border: 'none' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#E8472C'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#0F0F0E'}>
                  <div style={{ width: 22, height: 22, border: '2px solid #FFFFFF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 10, height: 10, background: '#E8472C', borderRadius: '50%' }}></div>
                  </div>
                  <div style={{ font: "600 13px/1 'IBM Plex Sans'", letterSpacing: '.16em', textTransform: 'uppercase' }}>Capture #{nextNumber}</div>
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                  <button onClick={openManual}
                    style={{ background: '#F4F2ED', color: '#0F0F0E', padding: 14, border: '1px solid #0F0F0E', font: "600 11px/1 'IBM Plex Sans'", letterSpacing: '.12em', textTransform: 'uppercase', borderRadius: 0, cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#0F0F0E'; e.currentTarget.style.color = '#FFFFFF'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#F4F2ED'; e.currentTarget.style.color = '#0F0F0E'; }}>
                    No Nameplate
                  </button>
                  <button onClick={openManual}
                    style={{ background: '#F4F2ED', color: '#0F0F0E', padding: 14, border: '1px solid #0F0F0E', font: "600 11px/1 'IBM Plex Sans'", letterSpacing: '.12em', textTransform: 'uppercase', borderRadius: 0, cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#0F0F0E'; e.currentTarget.style.color = '#FFFFFF'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#F4F2ED'; e.currentTarget.style.color = '#0F0F0E'; }}>
                    Manual Entry
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CAMERA */}
          {screen === 'camera' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#0A0A09', color: '#FFFFFF', animation: 'fadeIn 0.18s ease-out' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(0,0,0,.4)' }}>
                <button onClick={() => setScreen('list')}
                  style={{ color: '#FFFFFF', font: "600 11px/1 'IBM Plex Sans'", letterSpacing: '.14em', textTransform: 'uppercase', padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer' }}>
                  ✕ Cancel
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, background: '#E8472C', borderRadius: '50%', animation: 'blink 1.4s infinite' }}></div>
                  <div style={{ font: "600 12px/1 'IBM Plex Mono'", color: '#FFFFFF' }}>UNIT #{nextNumber}</div>
                </div>
              </div>

              <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, #1a1a18 0%, #0A0A09 70%)' }}></div>
                <div style={{ position: 'absolute', inset: 0, opacity: .04, backgroundImage: 'repeating-linear-gradient(0deg,#FFF 0,#FFF 1px,transparent 1px,transparent 3px)' }}></div>
                <div style={{ position: 'relative', width: 300, height: 200 }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 34, height: 34, borderTop: '3px solid #E8472C', borderLeft: '3px solid #E8472C' }}></div>
                  <div style={{ position: 'absolute', top: 0, right: 0, width: 34, height: 34, borderTop: '3px solid #E8472C', borderRight: '3px solid #E8472C' }}></div>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, width: 34, height: 34, borderBottom: '3px solid #E8472C', borderLeft: '3px solid #E8472C' }}></div>
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 34, height: 34, borderBottom: '3px solid #E8472C', borderRight: '3px solid #E8472C' }}></div>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
                    <div style={{ font: "600 10px/1 'IBM Plex Sans'", letterSpacing: '.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>Align nameplate</div>
                    <div style={{ font: "400 11px/1.3 'IBM Plex Mono'", color: 'rgba(255,255,255,.35)', textAlign: 'center' }}>BRAND · MODEL · SERIAL<br />inside the frame</div>
                  </div>
                </div>
              </div>

              <div style={{ padding: '10px 20px', background: 'rgba(0,0,0,.4)', borderTop: '1px solid rgba(255,255,255,.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                  <div style={{ width: 14, height: 14, border: '1.5px solid rgba(255,255,255,.6)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', font: "700 9px/1 'IBM Plex Sans'", color: 'rgba(255,255,255,.7)' }}>i</div>
                  <div style={{ font: "400 11px/1.3 'IBM Plex Sans'", color: 'rgba(255,255,255,.6)' }}>Hold steady. AI will read the plate.</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr', alignItems: 'center', padding: '24px 20px 28px', background: '#000' }}>
                <button onClick={() => setFlashOn(!flashOn)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: '#FFFFFF', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <div style={{ width: 36, height: 36, border: `1.5px solid ${flashOn ? '#E8472C' : 'rgba(255,255,255,.4)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: flashOn ? '#E8472C' : 'rgba(255,255,255,.7)' }}>⚡</div>
                  <div style={{ font: "500 9px/1 'IBM Plex Sans'", letterSpacing: '.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,.5)' }}>Flash</div>
                </button>
                <button onClick={shoot}
                  style={{ width: 88, height: 88, borderRadius: '50%', border: '4px solid #FFFFFF', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', margin: '0 auto', cursor: 'pointer' }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FFFFFF' }}></div>
                </button>
                <button onClick={openManual}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: '#FFFFFF', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <div style={{ width: 36, height: 36, border: '1.5px solid rgba(255,255,255,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: "700 12px/1 'IBM Plex Mono'", color: '#FFFFFF' }}>✕</div>
                  <div style={{ font: "500 9px/1 'IBM Plex Sans'", letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,.7)' }}>No plate</div>
                </button>
              </div>
            </div>
          )}

          {/* EXTRACTING */}
          {screen === 'extracting' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#0A0A09', color: '#FFFFFF', animation: 'fadeIn 0.18s ease-out' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(0,0,0,.4)' }}>
                <div style={{ font: "600 11px/1 'IBM Plex Sans'", letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)' }}>Processing</div>
                <div style={{ font: "600 12px/1 'IBM Plex Mono'", color: '#FFFFFF' }}>UNIT #{nextNumber}</div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div style={{ position: 'relative', width: 280, height: 180, background: 'linear-gradient(135deg,#2a2826,#1a1817)', border: '1px solid #3a3835', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}>
                  <div style={{ padding: 14, fontFamily: "'IBM Plex Mono'", color: '#cfc7b8' }}>
                    <div style={{ font: "600 11px/1 'IBM Plex Sans'", letterSpacing: '.2em', color: '#fff', opacity: .85 }}>{capturedBrand}</div>
                    <div style={{ width: '100%', height: 1, background: 'rgba(255,255,255,.18)', margin: '8px 0' }}></div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 10, lineHeight: 1.5, opacity: .7 }}><span style={{ width: 40 }}>MODEL</span><span>{capturedModel}</span></div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 10, lineHeight: 1.5, opacity: .7 }}><span style={{ width: 40 }}>S/N</span><span>{capturedSerial}</span></div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 9, lineHeight: 1.5, opacity: .4 }}><span style={{ width: 40 }}>VOLTS</span><span>115V 60Hz</span></div>
                    <div style={{ display: 'flex', gap: 8, fontSize: 9, lineHeight: 1.5, opacity: .4 }}><span style={{ width: 40 }}>AMPS</span><span>15A</span></div>
                    <div style={{ fontSize: 8, opacity: .3, marginTop: 6 }}>MADE IN MEXICO · ETL LISTED</div>
                  </div>
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, background: 'linear-gradient(180deg,rgba(232,71,44,0),rgba(232,71,44,.9),rgba(232,71,44,0))', boxShadow: '0 0 12px #E8472C', animation: 'scan 1.4s linear infinite' }}></div>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 18, height: 18, borderTop: '2px solid #E8472C', borderLeft: '2px solid #E8472C' }}></div>
                  <div style={{ position: 'absolute', top: 0, right: 0, width: 18, height: 18, borderTop: '2px solid #E8472C', borderRight: '2px solid #E8472C' }}></div>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, width: 18, height: 18, borderBottom: '2px solid #E8472C', borderLeft: '2px solid #E8472C' }}></div>
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 18, height: 18, borderBottom: '2px solid #E8472C', borderRight: '2px solid #E8472C' }}></div>
                </div>

                <div style={{ marginTop: 32, textAlign: 'center' }}>
                  <div style={{ font: "600 14px/1.3 'IBM Plex Sans'", color: '#FFFFFF', letterSpacing: '.04em' }}>Reading nameplate…</div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'center', justifyContent: 'center' }}>
                    {stepDot(1, 'BRAND')}
                    {stepDot(2, 'MODEL')}
                    {stepDot(3, 'SERIAL')}
                  </div>
                  <div style={{ width: 220, height: 2, background: 'rgba(255,255,255,.15)', margin: '24px auto 0', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: '#E8472C', transformOrigin: 'left', animation: 'barFill 1.8s linear forwards' }}></div>
                  </div>
                  <div style={{ font: "400 10px/1 'IBM Plex Mono'", color: 'rgba(255,255,255,.4)', letterSpacing: '.08em', marginTop: 10 }}>claude-sonnet-4-6 · vision</div>
                </div>
              </div>
            </div>
          )}

          {/* CONFIRM */}
          {screen === 'confirm' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#F4F2ED' }}>
              <div style={{ padding: '14px 18px 12px', background: '#F4F2ED', borderBottom: '1px solid #0F0F0E', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <button onClick={() => setScreen('list')}
                  style={{ font: "600 11px/1 'IBM Plex Sans'", letterSpacing: '.14em', textTransform: 'uppercase', color: '#0F0F0E', padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer' }}>
                  ✕ Cancel
                </button>
                <div style={{ font: "600 14px/1 'IBM Plex Mono'", color: '#0F0F0E' }}>UNIT #{nextNumber}</div>
                <div style={{ width: 60 }}></div>
              </div>

              <div style={{ flex: 1, overflow: 'auto', padding: '0 18px 16px' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'stretch', padding: '14px 0 16px', borderBottom: '1px solid #DAD6CC' }}>
                  {hasPhoto ? (
                    <div style={{ position: 'relative', width: 96, height: 72, background: 'linear-gradient(135deg,#2a2826,#1a1817)', border: '1px solid #0F0F0E', flexShrink: 0, overflow: 'hidden' }}>
                      <div style={{ padding: 6, fontFamily: "'IBM Plex Mono'", color: '#cfc7b8', fontSize: 6, lineHeight: 1.3 }}>
                        <div style={{ fontSize: 7, fontWeight: 600, color: '#fff' }}>{capturedBrand}</div>
                        <div style={{ height: .5, background: 'rgba(255,255,255,.2)', margin: '2px 0' }}></div>
                        <div style={{ opacity: .7 }}>MODEL {capturedModel}</div>
                        <div style={{ opacity: .7 }}>S/N {capturedSerial}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ width: 96, height: 72, background: '#F4F2ED', border: '2px dashed #0F0F0E', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ font: "600 9px/1.2 'IBM Plex Mono'", color: '#57544D', textAlign: 'center' }}>NO<br />PHOTO</div>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ font: "600 10px/1 'IBM Plex Sans'", letterSpacing: '.16em', textTransform: 'uppercase', color: '#57544D' }}>
                        {hasPhoto ? 'Extracted from photo' : 'Manual entry'}
                      </div>
                      <div style={{ font: "500 13px/1.3 'IBM Plex Sans'", color: '#0F0F0E', marginTop: 6 }}>
                        {hasPhoto ? 'Confirm values below' : 'Fill in all fields'}
                      </div>
                    </div>
                    {hasPhoto && (
                      <button onClick={() => setScreen('camera')}
                        style={{ alignSelf: 'flex-start', padding: '6px 10px', border: '1px solid #0F0F0E', font: "600 10px/1 'IBM Plex Sans'", letterSpacing: '.12em', textTransform: 'uppercase', background: '#F4F2ED', color: '#0F0F0E', cursor: 'pointer' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#0F0F0E'; e.currentTarget.style.color = '#FFFFFF'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#F4F2ED'; e.currentTarget.style.color = '#0F0F0E'; }}>
                        Retake
                      </button>
                    )}
                  </div>
                </div>

                <FieldLabel label="Brand" badge={hasPhoto ? { text: '✓ Read', color: '#1F7A4D' } : undefined}>
                  <input type="text" value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} placeholder="Brand from nameplate"
                    style={{ width: '100%', background: '#FFFFFF', border: '1px solid #0F0F0E', padding: '12px 12px', font: "500 15px/1.2 'IBM Plex Sans'", color: '#0F0F0E', borderRadius: 0, boxSizing: 'border-box' }} />
                </FieldLabel>

                <FieldLabel label="Model" badge={{ text: 'text · preserves zeros', color: '#57544D' }}>
                  <input type="text" value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} placeholder="Model number"
                    style={{ width: '100%', background: '#FFFFFF', border: '1px solid #0F0F0E', padding: '12px 12px', font: "500 15px/1.2 'IBM Plex Mono'", color: '#0F0F0E', borderRadius: 0, letterSpacing: '.02em', boxSizing: 'border-box' }} />
                </FieldLabel>

                <FieldLabel label="Serial" actions={
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[['No serial', 'N/A'], ['Unreadable', 'UNREADABLE']].map(([label, val]) => (
                      <button key={val} onClick={() => setDraft({ ...draft, serial: val })}
                        style={{ padding: '4px 8px', font: "600 9px/1 'IBM Plex Sans'", letterSpacing: '.1em', textTransform: 'uppercase', background: '#F4F2ED', color: '#0F0F0E', border: '1px solid #0F0F0E', cursor: 'pointer' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                }>
                  <input type="text" value={draft.serial} onChange={(e) => setDraft({ ...draft, serial: e.target.value })} placeholder="Serial number"
                    style={{ width: '100%', background: '#FFFFFF', border: '1px solid #0F0F0E', padding: '12px 12px', font: "500 15px/1.2 'IBM Plex Mono'", color: '#0F0F0E', borderRadius: 0, letterSpacing: '.02em', boxSizing: 'border-box' }} />
                </FieldLabel>

                <FieldLabel label="Appliance Type">
                  <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                    style={{ width: '100%', background: '#FFFFFF', border: '1px solid #0F0F0E', padding: '12px 12px', font: "500 15px/1.2 'IBM Plex Sans'", color: '#0F0F0E', borderRadius: 0 }}>
                    {['Refrigerator','Dishwasher','Range','Microwave','Washer','Dryer','HVAC','Water Heater','Other'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </FieldLabel>

                <FieldLabel label="Color">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setDraft({ ...draft, color: c })}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px',
                          background: draft.color === c ? '#0F0F0E' : '#FFFFFF',
                          color: draft.color === c ? '#FFFFFF' : '#0F0F0E',
                          border: `1px solid ${draft.color === c ? '#0F0F0E' : '#DAD6CC'}`,
                          font: "600 11px/1 'IBM Plex Sans'", letterSpacing: '.1em', textTransform: 'uppercase',
                          cursor: 'pointer', borderRadius: 0
                        }}>
                        <div style={{ width: 10, height: 10, background: COLOR_HEX[c], border: '1px solid rgba(0,0,0,.15)', flexShrink: 0 }}></div>
                        {c}
                      </button>
                    ))}
                  </div>
                </FieldLabel>

                <FieldLabel label="Notes (optional)">
                  <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Condition, location, remarks..."
                    style={{ width: '100%', background: '#FFFFFF', border: '1px solid #0F0F0E', padding: '12px 12px', font: "400 14px/1.4 'IBM Plex Sans'", color: '#0F0F0E', borderRadius: 0, minHeight: 72, resize: 'vertical', boxSizing: 'border-box' }} />
                </FieldLabel>
              </div>

              <div style={{ padding: '16px 18px 20px', background: '#F4F2ED', borderTop: '1px solid #DAD6CC' }}>
                <button onClick={saveRecord} disabled={!isSaveable}
                  style={{
                    width: '100%', background: isSaveable ? '#0F0F0E' : '#DAD6CC', color: '#FFFFFF',
                    padding: 18, font: "600 13px/1 'IBM Plex Sans'", letterSpacing: '.16em', textTransform: 'uppercase',
                    borderRadius: 0, cursor: isSaveable ? 'pointer' : 'not-allowed', border: 'none'
                  }}
                  onMouseEnter={(e) => { if (isSaveable) e.currentTarget.style.background = '#E8472C'; }}
                  onMouseLeave={(e) => { if (isSaveable) e.currentTarget.style.background = '#0F0F0E'; }}>
                  Save · next is #{nextNumber + 1}
                </button>
              </div>
            </div>
          )}

          {/* NEW BATCH CONFIRM SHEET */}
          {confirmSheet && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ width: '100%', background: '#F4F2ED', borderTop: '3px solid #E8472C', padding: '28px 24px 32px', animation: 'slideUp 0.22s ease-out', boxSizing: 'border-box' }}>
                <div style={{ font: "600 16px/1.3 'IBM Plex Sans'", color: '#0F0F0E', marginBottom: 8 }}>Start a new batch?</div>
                <div style={{ font: "400 13px/1.5 'IBM Plex Sans'", color: '#57544D', marginBottom: 24 }}>
                  {records.length > 0
                    ? `This will clear all ${records.length} record${records.length !== 1 ? 's' : ''} from "${batchName}". Export first if you need them.`
                    : 'Return to setup and configure a new batch.'}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setConfirmSheet(false)}
                    style={{ flex: 1, padding: 16, background: '#FFFFFF', border: '1px solid #0F0F0E', font: "600 12px/1 'IBM Plex Sans'", letterSpacing: '.14em', textTransform: 'uppercase', cursor: 'pointer', color: '#0F0F0E', borderRadius: 0 }}>
                    Cancel
                  </button>
                  <button onClick={confirmNewBatch}
                    style={{ flex: 1, padding: 16, background: '#E8472C', border: 'none', font: "600 12px/1 'IBM Plex Sans'", letterSpacing: '.14em', textTransform: 'uppercase', cursor: 'pointer', color: '#FFFFFF', borderRadius: 0 }}>
                    Clear & Reset
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </AndroidDevice>

      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: .3; }
        }
        @keyframes barFill {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function FieldLabel({ label, badge, actions, children }: {
  label: string;
  badge?: { text: string; color: string };
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ font: "600 10px/1 'IBM Plex Sans'", letterSpacing: '.16em', textTransform: 'uppercase', color: '#0F0F0E' }}>▌ {label}</div>
        {badge && <div style={{ font: "500 9px/1 'IBM Plex Mono'", letterSpacing: '.08em', textTransform: 'uppercase', color: badge.color }}>{badge.text}</div>}
        {actions}
      </div>
      {children}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ font: "600 9px/1.6 'IBM Plex Sans'", letterSpacing: '.14em', textTransform: 'uppercase', color: '#AAA', width: 44, flexShrink: 0, paddingTop: 1 }}>{label}</div>
      <div style={{ font: `400 12px/1.4 '${mono ? 'IBM Plex Mono' : 'IBM Plex Sans'}'`, color: '#0F0F0E', wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}
