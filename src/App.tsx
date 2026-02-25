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

// Exact tokens from client-hub/src/index.css
const FG      = '#171717'  // hsl(0 0% 9%) - foreground
const MUTED   = '#737373'  // hsl(0 0% 45%) - muted-foreground
const BORDER  = '#E5E5E5'  // hsl(0 0% 90%) - border
const SEC_BG  = '#F5F5F5'  // hsl(0 0% 96%) - secondary/muted
const SUCCESS = '#16A34A'  // hsl(142 76% 36%) - success
const EMERALD = '#10B981'  // brand emerald (progress bar + drag highlight)

function Logo() {
  return (
    <img src="/logo.svg" alt="1 Hour Recruitment" style={{ height: 28 }} />
  )
}

function Stat({ label, value, success = false }: { label: string; value: number; success?: boolean }) {
  return (
    <div style={{ background: SEC_BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '14px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: success ? SUCCESS : FG, fontFamily: 'Inter, sans-serif', lineHeight: 1, letterSpacing: '-0.02em' }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 10, fontWeight: 500, color: MUTED, marginTop: 5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
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
    background: '#FFFFFF',
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    padding: 24,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: 'Inter, sans-serif',
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: MUTED,
    marginBottom: 8,
  }

  return (
    <div style={{ minHeight: '100vh', background: SEC_BG, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 20px', fontFamily: 'Inter, sans-serif', color: FG, fontWeight: 300 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <Logo />
          <div style={{ marginTop: 20 }}>
            <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: 20, fontWeight: 600, color: FG, lineHeight: 1.25, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
              Lead Enrichment
            </h1>
            <p style={{ fontSize: 13, color: MUTED, fontWeight: 300, lineHeight: 1.65, margin: 0 }}>
              Upload a company list to extract employees with verified emails and phone numbers.
            </p>
          </div>
        </div>

        {!jobId ? (
          <div style={card}>

            {/* File drop zone */}
            <div style={{ marginBottom: 20 }}>
              <span style={labelStyle}>Company CSV</span>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `1px dashed ${dragging ? EMERALD : file ? SUCCESS : BORDER}`,
                  background: dragging ? 'rgba(16,185,129,0.03)' : file ? 'rgba(22,163,74,0.03)' : SEC_BG,
                  borderRadius: 6,
                  padding: '28px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} style={{ display: 'none' }} />
                {file ? (
                  <div>
                    <div style={{ fontSize: 15, color: SUCCESS, marginBottom: 6 }}>✓</div>
                    <div style={{ color: FG, fontWeight: 500, fontSize: 13 }}>{file.name}</div>
                    <div style={{ color: MUTED, fontSize: 12, marginTop: 3, fontWeight: 300 }}>{(file.size / 1024).toFixed(1)} KB</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 18, color: BORDER, marginBottom: 8, userSelect: 'none' }}>↑</div>
                    <div style={{ color: FG, fontSize: 13, fontWeight: 400 }}>Drop CSV here or click to browse</div>
                    <div style={{ color: MUTED, fontSize: 11, marginTop: 4, fontWeight: 300 }}>Requires a Company LinkedIn URL column</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ height: 1, background: BORDER, marginBottom: 20 }} />

            {/* Skip phone checkbox */}
            <div
              onClick={() => setSkipPhone(!skipPhone)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 20, userSelect: 'none' }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: 4, marginTop: 1, flexShrink: 0,
                background: skipPhone ? FG : '#FFFFFF',
                border: `1px solid ${skipPhone ? FG : BORDER}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}>
                {skipPhone && <span style={{ color: 'white', fontSize: 10, lineHeight: 1 }}>✓</span>}
              </div>
              <div>
                <div style={{ fontSize: 13, color: FG, fontWeight: 400 }}>Skip phone enrichment</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2, fontWeight: 300 }}>Saves ~5 credits per employee</div>
              </div>
            </div>

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 14px', color: '#DC2626', fontSize: 13, fontWeight: 300, marginBottom: 16 }}>
                {error}
              </div>
            )}

            {/* Primary button - matches website: bg-primary (near-black), hover:bg-primary/90 */}
            <button
              onClick={handleSubmit}
              disabled={!file || loading}
              style={{
                width: '100%',
                background: !file || loading ? SEC_BG : FG,
                color: !file || loading ? MUTED : '#FFFFFF',
                border: `1px solid ${!file || loading ? BORDER : FG}`,
                borderRadius: 6, padding: '10px 16px',
                fontSize: 14, fontWeight: 500, cursor: !file || loading ? 'not-allowed' : 'pointer',
                transition: 'opacity 0.15s', letterSpacing: '-0.01em',
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <span style={{ fontSize: 13, color: MUTED, fontWeight: 400 }}>
                {isDone ? 'Enrichment complete' :
                 status?.phase === 'enriching' ? 'Enriching employees...' : 'Starting...'}
              </span>
              {isDone && (
                <span style={{ fontSize: 10, fontWeight: 500, color: SUCCESS, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Complete
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 500, color: MUTED, letterSpacing: '0.05em', marginBottom: 8 }}>
                <span>{status ? `Company ${status.companyCurrent} of ${status.companyTotal}` : 'Waiting...'}</span>
                <span>{pct}%</span>
              </div>
              <div style={{ height: 4, background: SEC_BG, border: `1px solid ${BORDER}`, borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: isDone ? SUCCESS : EMERALD,
                  borderRadius: 999,
                  transition: 'width 0.4s cubic-bezier(0.22,1,0.36,1)',
                }} />
              </div>
              {status?.currentCompanyName && !isDone && (
                <div style={{ fontSize: 11, color: MUTED, fontWeight: 300, marginTop: 6 }}>
                  {status.currentCompanyName}
                </div>
              )}
            </div>

            {linkedinCol && (
              <div style={{ fontSize: 10, fontWeight: 500, color: MUTED, marginBottom: 16, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Column: <span style={{ fontFamily: 'monospace', color: FG, textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontSize: 12 }}>{linkedinCol}</span>
              </div>
            )}

            {/* Stats grid */}
            {status && (
              <div style={{ display: 'grid', gridTemplateColumns: skipPhone ? '1fr 1fr' : '1fr 1fr 1fr', gap: 8, marginBottom: isDone ? 20 : 0 }}>
                <Stat label="Employees" value={status.employeesFound} />
                <Stat label="Emails" value={status.emailsFound} success />
                {!skipPhone && <Stat label="Phones" value={status.phonesFound} success />}
              </div>
            )}

            {isDone && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Download: success/emerald (semantic - completed action) */}
                <button
                  onClick={() => window.location.assign(`/api/download/${jobId}`)}
                  style={{ width: '100%', background: SUCCESS, color: 'white', border: 'none', borderRadius: 6, padding: '10px 16px', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif', letterSpacing: '-0.01em', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => (e.target as HTMLButtonElement).style.opacity = '0.9'}
                  onMouseLeave={e => (e.target as HTMLButtonElement).style.opacity = '1'}
                >
                  Download Enriched CSV
                </button>
                {/* Outline secondary */}
                <button
                  onClick={reset}
                  style={{ width: '100%', background: '#FFFFFF', color: FG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '10px 16px', fontSize: 13, fontWeight: 400, cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.target as HTMLButtonElement).style.background = SEC_BG}
                  onMouseLeave={e => (e.target as HTMLButtonElement).style.background = '#FFFFFF'}
                >
                  Enrich Another File
                </button>
              </div>
            )}

            {status?.error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 14px', color: '#DC2626', fontSize: 13, fontWeight: 300, marginTop: 16 }}>
                Error: {status.error}
              </div>
            )}
          </div>
        )}

        {/* CSV hint */}
        {!jobId && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 6, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Required: </span>
            <span style={{ fontSize: 12, color: FG, fontFamily: 'monospace', fontWeight: 400 }}>Company LinkedIn URL</span>
            <span style={{ fontSize: 12, color: MUTED, fontWeight: 300 }}> column</span>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 40, paddingTop: 18, borderTop: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 400, color: MUTED }}>1 Hour Recruitment</span>
          <span style={{ fontSize: 11, fontWeight: 400, color: MUTED }}>1hourrecruitment.com</span>
        </div>

      </div>
    </div>
  )
}
