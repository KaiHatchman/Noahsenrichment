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

function Stat({ label, value, color = 'text-white' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-gray-800 rounded-xl p-4 text-center">
      <div className={`text-3xl font-bold ${color}`}>{value.toLocaleString()}</div>
      <div className="text-xs text-gray-400 mt-1">{label}</div>
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
      setFile(f)
      setError(null)
    } else {
      setError('Please drop a .csv file')
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); setError(null) }
  }

  const handleSubmit = async () => {
    if (!file) {
      setError('Please select a CSV file')
      return
    }

    setLoading(true)
    setError(null)
    setStatus(null)
    setJobId(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('skipPhone', String(skipPhone))

    try {
      const res = await fetch('/api/enrich', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Upload failed')
        setLoading(false)
        return
      }

      setJobId(data.jobId)
      setLinkedinCol(data.linkedinCol)
      setLoading(false)

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
    setJobId(null)
    setStatus(null)
    setFile(null)
    setError(null)
    setLinkedinCol(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const pct = status && status.companyTotal > 0
    ? Math.round((status.companyCurrent / status.companyTotal) * 100)
    : 0
  const isDone = status?.done

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-start justify-center p-6 pt-16">
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-bold text-white">Blitz Enrichment</h1>
          <p className="text-gray-400 text-sm">
            Upload companies with LinkedIn URLs - get all employees with emails &amp; phones
          </p>
        </div>

        {!jobId ? (
          <div className="bg-gray-900 rounded-2xl p-6 space-y-5 border border-gray-800">

            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Company CSV
              </label>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={[
                  'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
                  dragging ? 'border-blue-500 bg-blue-500/10' :
                  file ? 'border-green-600 bg-green-900/20' :
                  'border-gray-700 hover:border-gray-500 hover:bg-gray-800/50'
                ].join(' ')}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {file ? (
                  <div>
                    <div className="text-green-400 text-3xl mb-2">✓</div>
                    <div className="text-white font-medium">{file.name}</div>
                    <div className="text-gray-400 text-xs mt-1">
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-gray-500 text-3xl mb-2">↑</div>
                    <div className="text-gray-300 text-sm">Drop CSV here or click to browse</div>
                    <div className="text-gray-500 text-xs mt-1.5">
                      Needs a column with company LinkedIn URLs
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Options */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={skipPhone}
                onChange={e => setSkipPhone(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-500"
              />
              <div>
                <div className="text-sm font-medium text-gray-300">Skip phone enrichment</div>
                <div className="text-xs text-gray-500">Saves ~5 credits per employee</div>
              </div>
            </label>

            {error && (
              <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-red-300 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!file || loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 transition-colors"
            >
              {loading ? 'Starting...' : 'Start Enrichment'}
            </button>
          </div>

        ) : (
          <div className="bg-gray-900 rounded-2xl p-6 space-y-5 border border-gray-800">

            {/* Phase label */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-300">
                {isDone ? 'Enrichment complete' :
                 status?.phase === 'enriching' ? 'Enriching employees...' :
                 'Starting...'}
              </span>
              {isDone && (
                <span className="text-green-400 text-sm font-medium">Done</span>
              )}
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>
                  {status
                    ? `Company ${status.companyCurrent} of ${status.companyTotal}`
                    : 'Waiting...'}
                </span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isDone ? 'bg-green-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {status?.currentCompanyName && !isDone && (
                <div className="text-xs text-gray-500 mt-1.5 truncate">
                  Processing: {status.currentCompanyName}
                </div>
              )}
            </div>

            {/* LinkedIn col info */}
            {linkedinCol && (
              <div className="text-xs text-gray-600">
                LinkedIn column detected: <span className="text-gray-400 font-mono">{linkedinCol}</span>
              </div>
            )}

            {/* Stats grid */}
            {status && (
              <div className={`grid gap-3 ${skipPhone ? 'grid-cols-2' : 'grid-cols-3'}`}>
                <Stat label="Employees" value={status.employeesFound} />
                <Stat label="Emails" value={status.emailsFound} color="text-blue-400" />
                {!skipPhone && (
                  <Stat label="Phones" value={status.phonesFound} color="text-green-400" />
                )}
              </div>
            )}

            {isDone && (
              <div className="space-y-3 pt-1">
                <button
                  onClick={() => window.location.assign(`/api/download/${jobId}`)}
                  className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl py-3 transition-colors"
                >
                  Download Enriched CSV
                </button>
                <button
                  onClick={reset}
                  className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl py-2.5 transition-colors text-sm"
                >
                  Enrich Another File
                </button>
              </div>
            )}

            {status?.error && (
              <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-3 text-red-300 text-sm">
                Error: {status.error}
              </div>
            )}
          </div>
        )}

        {/* CSV format hint */}
        {!jobId && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-xs text-gray-500">
            <div className="text-gray-400 font-medium mb-1.5">Required CSV column</div>
            <div><span className="text-gray-300 font-mono">Company LinkedIn URL</span> - one company per row</div>
          </div>
        )}

      </div>
    </div>
  )
}
