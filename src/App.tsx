import { useState, useCallback, useRef } from 'react'

interface JobStatus {
  phase: 'queued' | 'enriching' | 'done' | 'error'
  companyCurrent: number
  companyTotal: number
  currentCompanyName?: string
  employeesFound: number
  emailsFound: number
  phonesFound: number
  done: boolean
  error?: string
}

const E = '#10B981'
const E_DARK = '#059669'

function Logo() {
  return (
    <div style={{ lineHeight: 1 }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px', color: 'white' }}>
        <span style={{ color: E }}>1</span>HR
      </div>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, fontWeight: 400, letterSpacing: '4px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginTop: 3 }}>
        RECRUITMENT
      </div>
    </div>
  )
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{ background: '#161616', border: '1px solid #242424', borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 26, fontWeight: 600, color: accent ? E : 'white', fontFamily: 'Inter, sans-serif', lineHeight: 1 }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 5, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 500 }}>
        {label}
      </div>
    </div>
  )
}

export default function App() {
  const [skipPhone, setSkipPhone] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [linkedinCol, setLinkedinCol] = useState<string | null>(null)
  const [status, setStatus] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const esRef = useRef<EventSource | null>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && f.name.toLowerCase().endsWith('.csv')) {
      setFile(f); setError(null)
    } else {
      setError('Please drop a .csv file')
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); setError(null) }
  }

  const handleSubmit = async () => {
    if (!file) { setError('Please select a CSV file'); return }
    setLoading(true); setError(null); setStatus(null); setJobId(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('skipPhone', String(skipPhone))

    try {
      const res = await fetch('/api/enrich', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Upload failed'); setLoading(false); return }

      setJobId(data.jobId); setLinkedinCol(data.linkedinCol); setLoading(false)

      const es = new EventSource(`/api/progress/${data.jobId}`)
      esRef.current = es
      es.onmessage = (e) => {
        const s: JobStatus = JSON.parse(e.data)
        setStatus(s)
        if (s.done || s.error) es.close()
      }
      es.onerror = () => es.close()
    } catch {
      setError('Network error - is the server running?')
      setLoading(false)
    }
  }

  const reset = () => {
    esRef.current?.close()
    setJobId(null); setStatus(null); setFile(null); setError(null); setLinkedinCol(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const pct = status && status.companyTotal > 0
    ? Math.round((status.companyCurrent / status.companyTotal) * 100) : 0
  const isDone = status?.done

  const card: React.CSSProperties = {
    background: '#111111',
    border: '1px solid #1e1e1e',
    borderRadius: 16,
    padding: 28,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '56px 24px', fontFamily: 'Inter, sans-serif', color: 'white' }}>
      <div style={{ width: '100%', maxWidth: 460 }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <Logo />
          <div style={{ width: 36, height: 2, background: E, margin: '18px 0 16px' }} />
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 30, fontWeight: 400, color: 'white', lineHeight: 1.1, margin: 0 }}>
            Lead Enrichment
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.32)', marginTop: 8, fontWeight: 300, lineHeight: 1.65 }}>
            Upload a company list to extract all employees with verified emails and phone numbers.
          </p>
        </div>

        {!jobId ? (
          <div style={card}>

            {/* File drop zone */}
            <div style={{ marginBottom: 20 }}>
              <span style={{ display: 'block', fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>
                Company CSV
              </span>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `1.5px dashed ${dragging ? E : file ? E_DARK : '#272727'}`,
                  background: dragging ? 'rgba(16,185,129,0.04)' : file ? 'rgba(5,150,105,0.04)' : '#0d0d0d',
                  borderRadius: 10,
                  padding: '32px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
                {file ? (
                  <div>
                    <div style={{ fontSize: 18, color: E, marginBottom: 8 }}>✓</div>
                    <div style={{ color: 'white', fontWeight: 500, fontSize: 14 }}>{file.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.22)', fontSize: 12, marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.12)', marginBottom: 10 }}>↑</div>
                    <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>Drop CSV here or click to browse</div>
                    <div style={{ color: 'rgba(255,255,255,0.18)', fontSize: 11, marginTop: 6 }}>Requires a Company LinkedIn URL column</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ height: 1, background: '#1c1c1c', marginBottom: 20 }} />

            {/* Skip phone */}
            <div
              onClick={() => setSkipPhone(!skipPhone)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', marginBottom: 22, userSelect: 'none' }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: 4, marginTop: 1, flexShrink: 0,
                background: skipPhone ? E : 'transparent',
                border: `1.5px solid ${skipPhone ? E : '#2e2e2e'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}>
                {skipPhone && <span style={{ color: 'white', fontSize: 10 }}>✓</span>}
              </div>
              <div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: 400 }}>Skip phone enrichment</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', marginTop: 2 }}>Saves ~5 credits per employee</div>
              </div>
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: '11px 14px', color: '#f87171', fontSize: 13, marginBottom: 18 }}>
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!file || loading}
              style={{
                width: '100%',
                background: !file || loading ? '#162520' : E,
                color: !file || loading ? 'rgba(255,255,255,0.2)' : 'white',
                border: 'none', borderRadius: 10, padding: '13px 0',
                fontSize: 14, fontWeight: 600, cursor: !file || loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s', letterSpacing: '0.02em',
                fontFamily: 'Inter, sans-serif',
              }}
              onMouseEnter={e => { if (file && !loading) (e.target as HTMLButtonElement).style.background = E_DARK }}
              onMouseLeave={e => { if (file && !loading) (e.target as HTMLButtonElement).style.background = E }}
            >
              {loading ? 'Starting...' : 'Start Enrichment'}
            </button>
          </div>

        ) : (
          <div style={card}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: 400 }}>
                {isDone ? 'Enrichment complete' :
                 status?.phase === 'enriching' ? 'Enriching employees...' : 'Starting...'}
              </span>
              {isDone && (
                <span style={{ fontSize: 9, color: E, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                  Complete
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.22)', marginBottom: 8 }}>
                <span>{status ? `Company ${status.companyCurrent} of ${status.companyTotal}` : 'Waiting...'}</span>
                <span>{pct}%</span>
              </div>
              <div style={{ height: 2, background: '#1c1c1c', borderRadius: 999 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: E, borderRadius: 999, transition: 'width 0.4s ease' }} />
              </div>
              {status?.currentCompanyName && !isDone && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', marginTop: 8 }}>
                  {status.currentCompanyName}
                </div>
              )}
            </div>

            {linkedinCol && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', marginBottom: 18, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Column: <span style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.32)', textTransform: 'none' }}>{linkedinCol}</span>
              </div>
            )}

            {/* Stats */}
            {status && (
              <div style={{ display: 'grid', gridTemplateColumns: skipPhone ? '1fr 1fr' : '1fr 1fr 1fr', gap: 8, marginBottom: isDone ? 22 : 0 }}>
                <Stat label="Employees" value={status.employeesFound} />
                <Stat label="Emails" value={status.emailsFound} accent />
                {!skipPhone && <Stat label="Phones" value={status.phonesFound} accent />}
              </div>
            )}

            {isDone && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={() => window.location.assign(`/api/download/${jobId}`)}
                  style={{ width: '100%', background: E, color: 'white', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', letterSpacing: '0.02em', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.target as HTMLButtonElement).style.background = E_DARK}
                  onMouseLeave={e => (e.target as HTMLButtonElement).style.background = E}
                >
                  Download Enriched CSV
                </button>
                <button
                  onClick={reset}
                  style={{ width: '100%', background: 'transparent', color: 'rgba(255,255,255,0.3)', border: '1px solid #1e1e1e', borderRadius: 10, padding: '11px 0', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                >
                  Enrich Another File
                </button>
              </div>
            )}

            {status?.error && (
              <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: '11px 14px', color: '#f87171', fontSize: 13, marginTop: 16 }}>
                Error: {status.error}
              </div>
            )}
          </div>
        )}

        {/* CSV hint */}
        {!jobId && (
          <div style={{ marginTop: 12, padding: '11px 16px', background: 'rgba(255,255,255,0.015)', border: '1px solid #161616', borderRadius: 10 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Required column: </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', fontFamily: 'monospace' }}>Company LinkedIn URL</span>
          </div>
        )}

        <div style={{ marginTop: 44, textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.1)', letterSpacing: '0.08em', fontWeight: 500 }}>
          1 HOUR RECRUITMENT
        </div>

      </div>
    </div>
  )
}
