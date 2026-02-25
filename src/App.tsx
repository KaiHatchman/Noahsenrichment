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

// Brand tokens - matches style guide exactly
const EMERALD = '#10B981'
const NEAR_BLACK = '#0A0A0A'

function IconMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 150 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M75 47C61.2 47 50 58.1 50 71.9C50 85.7 61.2 96.9 75 96.9C88.8 96.9 100 85.7 100 71.9C100 58.1 88.8 47 75 47Z" fill="#059669" fillOpacity="0.5"/>
      <path d="M37.5 123.7C37.5 109.1 51 98.1 65.4 101.1L69.8 102C73.2 102.8 76.8 102.8 80.3 102L84.7 101.1C99 98.1 112.5 109.1 112.5 123.7C112.5 136.5 102.2 146.9 89.4 146.9H60.6C47.9 146.9 37.5 136.5 37.5 123.7Z" fill="#059669" fillOpacity="0.5"/>
      <path d="M0 33.3V125C0 138.8 11.2 150 25 150C38.8 150 50 138.8 50 125V75C50 61.2 61.2 50 75 50C88.8 50 100 61.2 100 75V125C100 138.8 111.2 150 125 150C138.8 150 150 138.8 150 125V33.3C148 13.3 138.8 4.2 120.1 0.6C117.8 0.1 115.5 0 113.2 0H33.3C12.1 2.1 2.1 12.9 0 33.3Z" fill="#059669"/>
    </svg>
  )
}

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
      <IconMark size={36} />
      <div style={{ lineHeight: 1 }}>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 19, fontWeight: 700, letterSpacing: '-0.4px', color: 'white' }}>
          <span style={{ color: EMERALD }}>1</span>HOUR
        </div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 8, fontWeight: 400, letterSpacing: '4px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginTop: 4 }}>
          Recruitment
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '16px 12px', textAlign: 'center' }}>
      <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, fontWeight: 400, color: accent ? EMERALD : 'white', lineHeight: 1 }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginTop: 6, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
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

  // Style guide: 6px radius on all cards/buttons, white/5 bg, white/20 border on dark sections
  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    padding: 28,
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: 'Inter, sans-serif',
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 10,
  }

  return (
    <div style={{ minHeight: '100vh', background: NEAR_BLACK, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '56px 24px', fontFamily: 'Inter, sans-serif', color: 'white', fontWeight: 300 }}>
      <div style={{ width: '100%', maxWidth: 460 }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <Logo />
          {/* Emerald accent bar - matches cover page style */}
          <div style={{ width: 44, height: 3, background: EMERALD, margin: '28px 0 24px' }} />
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, fontWeight: 400, color: 'white', lineHeight: 1.1, margin: '0 0 10px', letterSpacing: '-0.01em' }}>
            Lead Enrichment
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: 300, lineHeight: 1.7, margin: 0 }}>
            Upload a company list to extract all employees with verified emails and phone numbers.
          </p>
        </div>

        {!jobId ? (
          <div style={card}>

            {/* File drop zone */}
            <div style={{ marginBottom: 22 }}>
              <span style={labelStyle}>Company CSV</span>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `1px dashed ${dragging ? EMERALD : file ? '#059669' : 'rgba(255,255,255,0.15)'}`,
                  background: dragging ? 'rgba(16,185,129,0.04)' : file ? 'rgba(5,150,105,0.04)' : 'transparent',
                  borderRadius: 6,
                  padding: '32px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
                {file ? (
                  <div>
                    <div style={{ fontSize: 18, color: EMERALD, marginBottom: 8 }}>✓</div>
                    <div style={{ color: 'white', fontWeight: 400, fontSize: 14 }}>{file.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 4, fontWeight: 300 }}>{(file.size / 1024).toFixed(1)} KB</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)', marginBottom: 10 }}>↑</div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 300 }}>Drop CSV here or click to browse</div>
                    <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: 6, fontWeight: 300 }}>Requires a Company LinkedIn URL column</div>
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 22 }} />

            {/* Skip phone */}
            <div
              onClick={() => setSkipPhone(!skipPhone)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', marginBottom: 24, userSelect: 'none' }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: 2, marginTop: 1, flexShrink: 0,
                background: skipPhone ? EMERALD : 'transparent',
                border: `1px solid ${skipPhone ? EMERALD : 'rgba(255,255,255,0.2)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s',
              }}>
                {skipPhone && <span style={{ color: 'white', fontSize: 10, lineHeight: 1 }}>✓</span>}
              </div>
              <div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 300 }}>Skip phone enrichment</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 2, fontWeight: 300 }}>Saves ~5 credits per employee</div>
              </div>
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '11px 14px', color: '#f87171', fontSize: 13, fontWeight: 300, marginBottom: 18 }}>
                {error}
              </div>
            )}

            {/* Primary button - style guide: 6px radius, weight 500, 90% opacity on hover */}
            <button
              onClick={handleSubmit}
              disabled={!file || loading}
              style={{
                width: '100%',
                background: !file || loading ? 'rgba(16,185,129,0.15)' : EMERALD,
                color: !file || loading ? 'rgba(255,255,255,0.25)' : 'white',
                border: 'none', borderRadius: 6, padding: '13px 0',
                fontSize: 14, fontWeight: 500, cursor: !file || loading ? 'not-allowed' : 'pointer',
                transition: 'opacity 0.2s', letterSpacing: '0.02em',
                fontFamily: 'Inter, sans-serif',
              }}
              onMouseEnter={e => { if (file && !loading) (e.target as HTMLButtonElement).style.opacity = '0.9' }}
              onMouseLeave={e => { if (file && !loading) (e.target as HTMLButtonElement).style.opacity = '1' }}
            >
              {loading ? 'Starting...' : 'Start Enrichment'}
            </button>
          </div>

        ) : (
          <div style={card}>

            {/* Status label + done badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: 300 }}>
                {isDone ? 'Enrichment complete' :
                 status?.phase === 'enriching' ? 'Enriching employees...' : 'Starting...'}
              </span>
              {isDone && (
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 500, color: EMERALD, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                  Complete
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em', marginBottom: 8 }}>
                <span>{status ? `Company ${status.companyCurrent} of ${status.companyTotal}` : 'Waiting...'}</span>
                <span>{pct}%</span>
              </div>
              <div style={{ height: 2, background: 'rgba(255,255,255,0.08)', borderRadius: 999 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: EMERALD, borderRadius: 999, transition: 'width 0.4s cubic-bezier(0.22,1,0.36,1)' }} />
              </div>
              {status?.currentCompanyName && !isDone && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontWeight: 300, marginTop: 8 }}>
                  {status.currentCompanyName}
                </div>
              )}
            </div>

            {linkedinCol && (
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.25)', marginBottom: 20, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                Column: <span style={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>{linkedinCol}</span>
              </div>
            )}

            {/* Stats grid */}
            {status && (
              <div style={{ display: 'grid', gridTemplateColumns: skipPhone ? '1fr 1fr' : '1fr 1fr 1fr', gap: 8, marginBottom: isDone ? 24 : 0 }}>
                <Stat label="Employees" value={status.employeesFound} />
                <Stat label="Emails" value={status.emailsFound} accent />
                {!skipPhone && <Stat label="Phones" value={status.phonesFound} accent />}
              </div>
            )}

            {isDone && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => window.location.assign(`/api/download/${jobId}`)}
                  style={{ width: '100%', background: EMERALD, color: 'white', border: 'none', borderRadius: 6, padding: '13px 0', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif', letterSpacing: '0.02em', transition: 'opacity 0.2s' }}
                  onMouseEnter={e => (e.target as HTMLButtonElement).style.opacity = '0.9'}
                  onMouseLeave={e => (e.target as HTMLButtonElement).style.opacity = '1'}
                >
                  Download Enriched CSV
                </button>
                {/* Ghost button variant */}
                <button
                  onClick={reset}
                  style={{ width: '100%', background: 'transparent', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '11px 0', fontSize: 13, fontWeight: 400, cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'opacity 0.2s' }}
                  onMouseEnter={e => (e.target as HTMLButtonElement).style.opacity = '0.7'}
                  onMouseLeave={e => (e.target as HTMLButtonElement).style.opacity = '1'}
                >
                  Enrich Another File
                </button>
              </div>
            )}

            {status?.error && (
              <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '11px 14px', color: '#f87171', fontSize: 13, fontWeight: 300, marginTop: 16 }}>
                Error: {status.error}
              </div>
            )}
          </div>
        )}

        {/* CSV hint */}
        {!jobId && (
          <div style={{ marginTop: 12, padding: '11px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Required: </span>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 400 }}>Company LinkedIn URL</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', fontWeight: 300 }}> column</span>
          </div>
        )}

        {/* Footer - matches cover page footer style */}
        <div style={{ marginTop: 48, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em' }}>
            1 Hour Recruitment
          </span>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em' }}>
            1hourrecruitment.com
          </span>
        </div>

      </div>
    </div>
  )
}
