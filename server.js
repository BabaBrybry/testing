require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// 1x1 transparent PNG pixel
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'haulmail-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function getUser(req) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
}

// ── Auth ─────────────────────────────────────────────────────────────────────

app.post('/api/signup', async (req, res) => {
  const { name, company, email, password } = req.body;
  if (!name || !company || !email || !password)
    return res.status(400).json({ error: 'All fields required' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'Email already registered' });

  const hash = await bcrypt.hash(password, 10);
  const id = uuidv4();
  db.prepare('INSERT INTO users (id, name, company, email, password) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, company, email, hash);

  req.session.userId = id;
  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  req.session.userId = user.id;
  res.json({ ok: true, name: user.name });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = getUser(req);
  res.json({ id: user.id, name: user.name, company: user.company, email: user.email });
});

// ── Carrier Lists ────────────────────────────────────────────────────────────

app.get('/api/lists', requireAuth, (req, res) => {
  const lists = db.prepare(`
    SELECT cl.*, COUNT(c.id) as carrier_count
    FROM carrier_lists cl
    LEFT JOIN carriers c ON c.list_id = cl.id
    WHERE cl.user_id = ?
    GROUP BY cl.id
    ORDER BY cl.created_at DESC
  `).all(req.session.userId);
  res.json(lists);
});

app.post('/api/lists', requireAuth, (req, res) => {
  const { name, lane } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  db.prepare('INSERT INTO carrier_lists (id, user_id, name, lane) VALUES (?, ?, ?, ?)')
    .run(id, req.session.userId, name, lane || null);
  res.json({ id, name, lane });
});

app.delete('/api/lists/:id', requireAuth, (req, res) => {
  const list = db.prepare('SELECT * FROM carrier_lists WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!list) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM carriers WHERE list_id = ?').run(req.params.id);
  db.prepare('DELETE FROM carrier_lists WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Carriers ─────────────────────────────────────────────────────────────────

app.get('/api/lists/:listId/carriers', requireAuth, (req, res) => {
  const list = db.prepare('SELECT * FROM carrier_lists WHERE id = ? AND user_id = ?')
    .get(req.params.listId, req.session.userId);
  if (!list) return res.status(404).json({ error: 'Not found' });

  const carriers = db.prepare('SELECT * FROM carriers WHERE list_id = ? ORDER BY company_name')
    .all(req.params.listId);
  res.json(carriers);
});

app.post('/api/lists/:listId/carriers', requireAuth, (req, res) => {
  const list = db.prepare('SELECT * FROM carrier_lists WHERE id = ? AND user_id = ?')
    .get(req.params.listId, req.session.userId);
  if (!list) return res.status(404).json({ error: 'Not found' });

  const { company_name, email, phone, notes } = req.body;
  if (!company_name || !email) return res.status(400).json({ error: 'Company name and email required' });

  const id = uuidv4();
  db.prepare('INSERT INTO carriers (id, list_id, company_name, email, phone, notes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.params.listId, company_name, email, phone || null, notes || null);
  res.json({ id, company_name, email, phone, notes });
});

app.delete('/api/carriers/:id', requireAuth, (req, res) => {
  const carrier = db.prepare(`
    SELECT c.* FROM carriers c
    JOIN carrier_lists cl ON cl.id = c.list_id
    WHERE c.id = ? AND cl.user_id = ?
  `).get(req.params.id, req.session.userId);
  if (!carrier) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM carriers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/lists/:listId/import', requireAuth, upload.single('csv'), (req, res) => {
  const list = db.prepare('SELECT * FROM carrier_lists WHERE id = ? AND user_id = ?')
    .get(req.params.listId, req.session.userId);
  if (!list) return res.status(404).json({ error: 'Not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let records;
  try {
    records = parse(req.file.buffer.toString(), { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid CSV format' });
  }

  const insert = db.prepare('INSERT OR IGNORE INTO carriers (id, list_id, company_name, email, phone, notes) VALUES (?, ?, ?, ?, ?, ?)');
  let count = 0;
  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      const email = row.email || row.Email || row.EMAIL;
      const company = row.company_name || row.company || row.Company || row.name || row.Name;
      if (email && company) {
        insert.run(uuidv4(), req.params.listId, company, email, row.phone || row.Phone || null, row.notes || null);
        count++;
      }
    }
  });
  insertMany(records);
  res.json({ imported: count });
});

// ── Loads ────────────────────────────────────────────────────────────────────

app.get('/api/loads', requireAuth, (req, res) => {
  const loads = db.prepare(`
    SELECT l.*,
      COUNT(b.id) as blast_count,
      SUM(CASE WHEN b.status = 'interested' THEN 1 ELSE 0 END) as interested_count,
      SUM(CASE WHEN b.opened_at IS NOT NULL THEN 1 ELSE 0 END) as opened_count
    FROM loads l
    LEFT JOIN blasts b ON b.load_id = l.id
    WHERE l.user_id = ?
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `).all(req.session.userId);
  res.json(loads);
});

app.get('/api/loads/:id', requireAuth, (req, res) => {
  const load = db.prepare('SELECT * FROM loads WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.session.userId);
  if (!load) return res.status(404).json({ error: 'Not found' });

  const blasts = db.prepare(`
    SELECT b.*, c.company_name, c.email as carrier_email, c.phone
    FROM blasts b
    JOIN carriers c ON c.id = b.carrier_id
    WHERE b.load_id = ?
    ORDER BY b.status DESC, b.sent_at DESC
  `).all(req.params.id);

  res.json({ ...load, blasts });
});

app.post('/api/loads', requireAuth, (req, res) => {
  const { origin, destination, equipment, weight, rate, pickup_date, notes } = req.body;
  if (!origin || !destination || !equipment || !rate || !pickup_date)
    return res.status(400).json({ error: 'Required fields missing' });

  const id = uuidv4();
  db.prepare('INSERT INTO loads (id, user_id, origin, destination, equipment, weight, rate, pickup_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.session.userId, origin, destination, equipment, weight || null, rate, pickup_date, notes || null);
  res.json({ id, origin, destination, equipment, rate, pickup_date });
});

app.patch('/api/loads/:id/status', requireAuth, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE loads SET status = ? WHERE id = ? AND user_id = ?')
    .run(status, req.params.id, req.session.userId);
  res.json({ ok: true });
});

// ── Blast ─────────────────────────────────────────────────────────────────────

app.post('/api/loads/:loadId/blast', requireAuth, async (req, res) => {
  const { list_id } = req.body;
  if (!list_id) return res.status(400).json({ error: 'list_id required' });

  const load = db.prepare('SELECT * FROM loads WHERE id = ? AND user_id = ?')
    .get(req.params.loadId, req.session.userId);
  if (!load) return res.status(404).json({ error: 'Load not found' });

  const list = db.prepare('SELECT * FROM carrier_lists WHERE id = ? AND user_id = ?')
    .get(list_id, req.session.userId);
  if (!list) return res.status(404).json({ error: 'Carrier list not found' });

  const carriers = db.prepare('SELECT * FROM carriers WHERE list_id = ?').all(list_id);
  if (carriers.length === 0) return res.status(400).json({ error: 'No carriers in list' });

  const user = getUser(req);
  const appDomain = process.env.APP_DOMAIN || 'haulmail.app';
  const resendKey = process.env.RESEND_API_KEY;

  // Create blast records first
  const insertBlast = db.prepare('INSERT INTO blasts (id, load_id, carrier_id) VALUES (?, ?, ?)');
  const blastIds = {};
  const createBlasts = db.transaction(() => {
    for (const carrier of carriers) {
      const blastId = uuidv4();
      insertBlast.run(blastId, load.id, carrier.id);
      blastIds[carrier.id] = blastId;
    }
  });
  createBlasts();

  // Send emails
  let sent = 0;
  const errors = [];

  for (const carrier of carriers) {
    const blastId = blastIds[carrier.id];
    const replyTo = `load-${load.id}-${carrier.id}@${appDomain}`;
    const trackingPixel = `${process.env.APP_URL || `https://${appDomain}`}/track/open?b=${blastId}`;

    const subject = `Load Available: ${load.origin} → ${load.destination} | ${load.pickup_date} | ${load.equipment} | $${load.rate}`;

    const html = buildEmailTemplate(load, user, trackingPixel, replyTo);
    const text = buildEmailText(load, user);

    if (resendKey) {
      try {
        const { Resend } = require('resend');
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: `${user.name} - ${user.company} <loads@${appDomain}>`,
          to: carrier.email,
          reply_to: replyTo,
          subject,
          html,
          text
        });
        sent++;
      } catch (e) {
        errors.push({ carrier: carrier.company_name, error: e.message });
      }
    } else {
      // Dev mode: log instead of send
      console.log(`[DEV] Would email ${carrier.email} — ${subject}`);
      console.log(`[DEV] Reply-To: ${replyTo}`);
      sent++;
    }
  }

  res.json({ sent, total: carriers.length, errors });
});

// ── Blast: Book a carrier ─────────────────────────────────────────────────────

app.patch('/api/blasts/:blastId/book', requireAuth, (req, res) => {
  const blast = db.prepare(`
    SELECT b.* FROM blasts b
    JOIN loads l ON l.id = b.load_id
    WHERE b.id = ? AND l.user_id = ?
  `).get(req.params.blastId, req.session.userId);
  if (!blast) return res.status(404).json({ error: 'Not found' });

  db.prepare("UPDATE blasts SET status = 'booked' WHERE id = ?").run(req.params.blastId);
  db.prepare("UPDATE loads SET status = 'covered' WHERE id = ?").run(blast.load_id);
  res.json({ ok: true });
});

app.patch('/api/blasts/:blastId/status', requireAuth, (req, res) => {
  const { status } = req.body;
  const blast = db.prepare(`
    SELECT b.* FROM blasts b
    JOIN loads l ON l.id = b.load_id
    WHERE b.id = ? AND l.user_id = ?
  `).get(req.params.blastId, req.session.userId);
  if (!blast) return res.status(404).json({ error: 'Not found' });

  db.prepare('UPDATE blasts SET status = ? WHERE id = ?').run(status, req.params.blastId);
  res.json({ ok: true });
});

// ── Open Tracking Pixel ───────────────────────────────────────────────────────

app.get('/track/open', (req, res) => {
  const { b: blastId } = req.query;
  if (blastId) {
    db.prepare("UPDATE blasts SET opened_at = CURRENT_TIMESTAMP WHERE id = ? AND opened_at IS NULL")
      .run(blastId);
  }
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(PIXEL);
});

// ── Inbound Reply Webhook (Resend) ────────────────────────────────────────────

app.post('/webhook/reply', express.json(), (req, res) => {
  // Resend inbound email webhook payload
  const { to, from, text, html } = req.body;
  if (!to) return res.json({ ok: true });

  // Parse load_id and carrier_id from the reply-to address
  // Format: load-{loadId}-{carrierId}@domain
  const toAddr = Array.isArray(to) ? to[0] : to;
  const match = toAddr.match(/load-([^-]+(?:-[^-]+)*)-([a-f0-9-]{36})@/);
  if (!match) return res.json({ ok: true });

  const loadId = match[1];
  const carrierId = match[2];

  const replyText = text || (html ? html.replace(/<[^>]+>/g, ' ').trim() : '');

  db.prepare(`
    UPDATE blasts
    SET replied_at = CURRENT_TIMESTAMP,
        reply_text = ?,
        status = CASE WHEN status = 'pending' THEN 'interested' ELSE status END
    WHERE load_id = ? AND carrier_id = ?
  `).run(replyText.slice(0, 2000), loadId, carrierId);

  res.json({ ok: true });
});

// ── Email Templates ───────────────────────────────────────────────────────────

function buildEmailTemplate(load, user, trackingPixel, replyTo) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="border-left: 4px solid #2563eb; padding-left: 16px; margin-bottom: 24px;">
    <h2 style="margin: 0 0 4px; color: #1e40af;">Load Available</h2>
    <p style="margin: 0; color: #6b7280; font-size: 14px;">From ${user.name} · ${user.company}</p>
  </div>

  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <tr style="background: #f8fafc;">
      <td style="padding: 12px 16px; font-weight: bold; width: 40%; border-bottom: 1px solid #e2e8f0;">Origin</td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0;">${load.origin}</td>
    </tr>
    <tr>
      <td style="padding: 12px 16px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Destination</td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0;">${load.destination}</td>
    </tr>
    <tr style="background: #f8fafc;">
      <td style="padding: 12px 16px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Equipment</td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0;">${load.equipment}</td>
    </tr>
    ${load.weight ? `<tr>
      <td style="padding: 12px 16px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Weight</td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0;">${load.weight}</td>
    </tr>` : ''}
    <tr style="${load.weight ? 'background: #f8fafc;' : ''}">
      <td style="padding: 12px 16px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Rate</td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #16a34a; font-weight: bold;">$${load.rate}</td>
    </tr>
    <tr style="${load.weight ? '' : 'background: #f8fafc;'}">
      <td style="padding: 12px 16px; font-weight: bold; border-bottom: 1px solid #e2e8f0;">Pickup Date</td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0;">${load.pickup_date}</td>
    </tr>
    ${load.notes ? `<tr>
      <td style="padding: 12px 16px; font-weight: bold; vertical-align: top;">Notes</td>
      <td style="padding: 12px 16px;">${load.notes}</td>
    </tr>` : ''}
  </table>

  <p style="margin-bottom: 24px; color: #374151;">
    Reply to this email if you're interested or have questions about the rate.
  </p>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
  <p style="font-size: 12px; color: #9ca3af; margin: 0;">
    Replies managed via <a href="https://haulmail.app" style="color: #9ca3af;">HaulMail</a> ·
    Load coverage tool for freight brokers
  </p>

  <img src="${trackingPixel}" width="1" height="1" style="display:none;" alt="">
</body>
</html>`;
}

function buildEmailText(load, user) {
  return `LOAD AVAILABLE — ${load.origin} → ${load.destination}
From: ${user.name} · ${user.company}

Origin:      ${load.origin}
Destination: ${load.destination}
Equipment:   ${load.equipment}
${load.weight ? `Weight:      ${load.weight}\n` : ''}Rate:        $${load.rate}
Pickup:      ${load.pickup_date}
${load.notes ? `Notes:       ${load.notes}\n` : ''}
Reply to this email if you're interested or have questions.

---
Replies managed via HaulMail · haulmail.app`;
}

// ── Serve SPA ─────────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`HaulMail running on http://localhost:${PORT}`);
  if (!process.env.RESEND_API_KEY) {
    console.log('[DEV] No RESEND_API_KEY set — emails will be logged to console only');
  }
});
