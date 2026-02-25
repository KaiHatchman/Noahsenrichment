'use strict';

const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const path = require('path');
const crypto = require('crypto');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const BLITZ_BASE_URL = 'https://api.blitz-api.ai';
const PAGE_SIZE = 50;
const DELAY_MS = 150;

// In-memory job store (cleaned up after 2 hours)
const jobs = new Map();

// Serve React build in production
app.use(express.static(path.join(__dirname, 'dist')));

// ── SSE progress stream ───────────────────────────────────────────────────────
app.get('/api/progress/:jobId', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.write(`data: ${JSON.stringify({ error: 'Job not found' })}\n\n`);
    res.end();
    return;
  }

  // Send current status immediately
  res.write(`data: ${JSON.stringify(job.status)}\n\n`);

  job.listeners.push(res);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(heartbeat);
    job.listeners = job.listeners.filter(l => l !== res);
  });
});

// ── Upload & start enrichment ─────────────────────────────────────────────────
app.post('/api/enrich', upload.single('file'), async (req, res) => {
  const { apiKey, skipPhone } = req.body;

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!apiKey || !apiKey.trim()) return res.status(400).json({ error: 'Blitz API key is required' });

  let rows;
  try {
    rows = parse(req.file.buffer.toString('utf-8'), {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
    });
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse CSV: ' + e.message });
  }

  if (!rows.length) return res.status(400).json({ error: 'CSV has no data rows' });

  const headers = Object.keys(rows[0]);

  // Detect company LinkedIn URL column
  const linkedinCol =
    headers.find(h => /^(company.?linkedin|linkedin.?url|linkedin.?profile)/i.test(h)) ||
    headers.find(h => h.toLowerCase().includes('linkedin')) ||
    headers.find(h => /^url$/i.test(h));

  if (!linkedinCol) {
    return res.status(400).json({
      error: `No LinkedIn URL column found. Columns detected: ${headers.join(', ')}`,
    });
  }

  // Try to detect optional metadata columns
  const nameCol = headers.find(h => /^(company.?name|name|company)$/i.test(h));
  const domainCol = headers.find(h => /^(domain|website|company.?domain)$/i.test(h));
  const locationCol = headers.find(h => /^(location|city|headquarters)$/i.test(h));
  const sizeCol = headers.find(h => /^(size|employees|company.?size|headcount)$/i.test(h));

  const jobId = crypto.randomUUID();
  const doSkipPhone = skipPhone === 'true';

  const job = {
    id: jobId,
    status: {
      phase: 'queued',
      companyCurrent: 0,
      companyTotal: rows.length,
      employeesFound: 0,
      emailsFound: 0,
      phonesFound: 0,
      done: false,
    },
    rows,
    linkedinCol,
    nameCol,
    domainCol,
    locationCol,
    sizeCol,
    apiKey: apiKey.trim(),
    skipPhone: doSkipPhone,
    results: [],
    listeners: [],
  };

  jobs.set(jobId, job);
  runEnrichment(job).catch(err => {
    console.error('Enrichment error:', err);
    broadcast(job, { phase: 'error', error: err.message, done: true });
  });

  // Clean up after 2 hours
  setTimeout(() => jobs.delete(jobId), 2 * 60 * 60 * 1000);

  res.json({ jobId, total: rows.length, linkedinCol });
});

// ── Download result ───────────────────────────────────────────────────────────
app.get('/api/download/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found or expired' });
  if (!job.status.done) return res.status(400).json({ error: 'Enrichment not complete yet' });

  const csv = stringify(job.results, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="enriched-employees.csv"');
  res.send(csv);
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ── Enrichment logic ──────────────────────────────────────────────────────────
async function runEnrichment(job) {
  const { rows, linkedinCol, nameCol, domainCol, locationCol, sizeCol, apiKey, skipPhone } = job;

  broadcast(job, { phase: 'enriching' });

  let employeesFound = 0;
  let emailsFound = 0;
  let phonesFound = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const companyUrl = (row[linkedinCol] || '').trim();
    const companyName = nameCol ? (row[nameCol] || '') : companyUrl;
    const companyDomain = domainCol ? (row[domainCol] || '') : '';
    const companyLocation = locationCol ? (row[locationCol] || '') : '';
    const companySize = sizeCol ? (row[sizeCol] || '') : '';

    broadcast(job, {
      companyCurrent: i + 1,
      currentCompanyName: companyName || companyUrl,
    });

    if (!companyUrl) {
      continue;
    }

    // Paginate through all employees
    const employees = await findAllEmployees(companyUrl, apiKey);
    employeesFound += employees.length;
    broadcast(job, { employeesFound });

    // Enrich each employee
    for (const emp of employees) {
      const liUrl = emp.linkedin_url || '';
      const location = emp.location || {};
      const experiences = emp.experiences || [];
      const currentExp = getCurrentExperience(experiences, companyUrl);
      const jobTitle = currentExp.job_title || emp.headline || '';

      let email = '';
      let emailStatus = '';
      let phone = '';

      if (liUrl) {
        const emailData = await blitzPost('/v2/enrichment/email', { person_linkedin_url: liUrl }, apiKey);
        email = emailData.email || '';
        emailStatus = emailData.email_status || '';
        if (email) { emailsFound++; broadcast(job, { emailsFound }); }

        await sleep(DELAY_MS);

        if (!skipPhone) {
          const phoneData = await blitzPost('/v2/enrichment/phone', { person_linkedin_url: liUrl }, apiKey);
          phone = phoneData.phone || '';
          if (phone) { phonesFound++; broadcast(job, { phonesFound }); }
          await sleep(DELAY_MS);
        }
      }

      job.results.push({
        company_name: companyName,
        company_linkedin_url: companyUrl,
        company_domain: companyDomain,
        company_location: companyLocation,
        company_size: companySize,
        full_name: emp.full_name || '',
        first_name: emp.first_name || '',
        last_name: emp.last_name || '',
        job_title: jobTitle,
        headline: emp.headline || '',
        person_linkedin_url: liUrl,
        city: location.city || '',
        state: location.state_code || '',
        country: location.country_code || '',
        email,
        email_status: emailStatus,
        phone_mobile: phone,
        connections_count: emp.connections_count || '',
      });
    }
  }

  broadcast(job, { phase: 'done', done: true, employeesFound, emailsFound, phonesFound });
}

async function findAllEmployees(companyUrl, apiKey) {
  const all = [];
  let page = 1;

  while (true) {
    const data = await blitzPost(
      '/v2/search/employee-finder',
      { company_linkedin_url: companyUrl, max_results: PAGE_SIZE, page },
      apiKey
    );
    const results = data.results || [];
    all.push(...results);
    if (results.length < PAGE_SIZE) break;
    page++;
    await sleep(DELAY_MS);
  }

  return all;
}

function getCurrentExperience(experiences, companyUrl) {
  const slug = companyUrl.replace(/\/$/, '').split('/company/').pop();
  for (const exp of experiences) {
    if (exp.job_is_current && slug && (exp.company_linkedin_url || '').includes(slug)) return exp;
  }
  for (const exp of experiences) {
    if (exp.job_is_current) return exp;
  }
  return experiences[0] || {};
}

async function blitzPost(endpoint, body, apiKey, retries = 4) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(`${BLITZ_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });

      if (r.status === 429) {
        const wait = Math.min(1000 * Math.pow(2, attempt), 16000);
        console.log(`[429] Rate limited - waiting ${wait}ms`);
        await sleep(wait);
        continue;
      }
      if (r.status === 422 || r.status === 404) return {};
      if (!r.ok) {
        if (attempt < retries) { await sleep(1000 * (attempt + 1)); continue; }
        return {};
      }
      return await r.json();
    } catch (e) {
      if (attempt < retries) await sleep(1000 * (attempt + 1));
      else return {};
    }
  }
  return {};
}

function broadcast(job, update) {
  Object.assign(job.status, update);
  const msg = `data: ${JSON.stringify(job.status)}\n\n`;
  job.listeners.forEach(res => res.write(msg));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\nBlitz Enrichment Server running on http://localhost:${PORT}\n`);
});
