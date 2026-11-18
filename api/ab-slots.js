// Agenda de demonstração da página /ab.
// Não toca na Google Calendar: as vagas são geradas por uma regra fixa e as
// reservas ficam guardadas no Vercel Blob, para o horário escolhido deixar de
// estar disponível para todos os visitantes.
const {
  MIN_NOTICE_MINUTES,
  nowInLisbon,
  parseDateParam,
  isDateBookable,
} = require('./_calendar');

const SLOT_TIMES = ['09:00', '09:45', '10:30', '11:15', '12:00', '12:45', '13:30', '14:15', '15:00', '15:45', '16:30', '17:15'];
const PREFIX = 'ab-reservas/';
const AVAILABILITY_RATE = 55; // ~55% das vagas abertas, para a agenda parecer viva

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Vagas "de base" de um dia: sempre as mesmas para a mesma data.
function baseSlots(dateStr) {
  return SLOT_TIMES.filter((t) => hash32(dateStr + '#' + t) % 100 < AVAILABILITY_RATE);
}

function blobKey(dateStr, time) {
  return PREFIX + dateStr + 'T' + time.replace(':', '-') + '.json';
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      if (typeof req.body === 'string') {
        try { return resolve(JSON.parse(req.body)); } catch (e) { return reject(e); }
      }
      return resolve(req.body);
    }
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function hasStore() {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

// O Blob aceita um token fixo ou, como aqui, o token OIDC do próprio pedido.
function blobAuth(req) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return { token: process.env.BLOB_READ_WRITE_TOKEN };
  }
  const auth = {};
  const oidc = (req && req.headers && req.headers['x-vercel-oidc-token']) || process.env.VERCEL_OIDC_TOKEN;
  if (oidc) auth.oidcToken = oidc;
  if (process.env.BLOB_STORE_ID) auth.storeId = process.env.BLOB_STORE_ID;
  return auth;
}

async function takenTimes(dateStr, req) {
  if (!hasStore()) return [];
  const { list } = require('@vercel/blob');
  const result = await list(Object.assign({ prefix: PREFIX + dateStr + 'T', limit: 100 }, blobAuth(req)));
  return (result.blobs || []).map((b) => {
    const match = b.pathname.match(/T(\d{2})-(\d{2})\.json$/);
    return match ? match[1] + ':' + match[2] : null;
  }).filter(Boolean);
}

// Minutos a partir dos quais ainda é possível marcar hoje (2 h de antecedência).
function cutoffMinutes(parsed) {
  const now = nowInLisbon();
  const sameDay = Date.UTC(now.year, now.month - 1, now.day) === Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  if (!sameDay) return null;
  return now.hour * 60 + now.minute + MIN_NOTICE_MINUTES;
}

function afterCutoff(time, cutoff) {
  if (cutoff === null) return true;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m >= cutoff;
}

async function handleGet(req, res) {
  const dateParam = typeof req.query.date === 'string' ? req.query.date : '';
  const parsed = parseDateParam(dateParam);
  if (!parsed) return res.status(400).json({ error: 'invalid_date' });

  res.setHeader('Cache-Control', 'no-store');
  if (!isDateBookable(parsed)) return res.status(200).json({ date: dateParam, slots: [] });

  let taken = [];
  let shared = hasStore();
  try {
    taken = await takenTimes(dateParam, req);
  } catch (err) {
    shared = false;
    console.error('ab-slots list error:', err.message);
  }

  const cutoff = cutoffMinutes(parsed);
  const slots = baseSlots(dateParam)
    .filter((t) => taken.indexOf(t) === -1 && afterCutoff(t, cutoff))
    .map((t) => ({ start: t }));

  return res.status(200).json({ date: dateParam, slots, shared });
}

async function handlePost(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'invalid_body' });
  }

  const date = typeof body.date === 'string' ? body.date : '';
  const time = typeof body.time === 'string' ? body.time : '';
  const parsed = parseDateParam(date);

  if (!parsed || !isDateBookable(parsed)) return res.status(400).json({ error: 'invalid_date' });
  if (SLOT_TIMES.indexOf(time) === -1) return res.status(400).json({ error: 'invalid_time' });
  if (baseSlots(date).indexOf(time) === -1 || !afterCutoff(time, cutoffMinutes(parsed))) {
    return res.status(409).json({ error: 'slot_taken' });
  }

  res.setHeader('Cache-Control', 'no-store');

  // Sem armazenamento configurado a página continua a funcionar, mas a reserva
  // só vale no dispositivo de quem marcou.
  if (!hasStore()) return res.status(200).json({ ok: true, shared: false });

  const { head, put } = require('@vercel/blob');
  const key = blobKey(date, time);
  const auth = blobAuth(req);

  const exists = async () => {
    try {
      await head(key, auth);
      return true;
    } catch (err) {
      return false;
    }
  };

  if (await exists()) return res.status(409).json({ error: 'slot_taken' });

  try {
    // Sem allowOverwrite: o Blob recusa escrever por cima de uma reserva.
    await put(key, JSON.stringify({ reservedAt: new Date().toISOString() }), Object.assign({
      access: 'private',
      addRandomSuffix: false,
      contentType: 'application/json',
    }, auth));
    return res.status(200).json({ ok: true, shared: true });
  } catch (err) {
    console.error('ab-slots put error:', err.message);
    // Falhou porque entretanto alguém reservou? Confirma antes de dar erro.
    if (await exists()) return res.status(409).json({ error: 'slot_taken' });
    return res.status(500).json({ error: 'reserve_failed' });
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'method_not_allowed' });
};
