const {
  TIMEZONE,
  SLOT_MINUTES,
  getCalendarClient,
  isoAt,
  parseDateParam,
  isDateBookable,
  buildSlotStarts,
  slotLabel,
} = require('./_calendar');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+[1-9]\d{7,14}$/;

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

function escapeText(str) {
  return String(str).replace(/[\r\n]+/g, ' ').trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'invalid_body' });
  }

  const date = typeof body.date === 'string' ? body.date : '';
  const time = typeof body.time === 'string' ? body.time : '';
  const name = escapeText(body.name || '');
  const email = escapeText(body.email || '').toLowerCase();
  const phone = escapeText(body.phone || '').replace(/[\s-]/g, '');

  const parsed = parseDateParam(date);
  if (!parsed || !isDateBookable(parsed)) {
    return res.status(400).json({ error: 'invalid_date' });
  }

  const validSlot = buildSlotStarts().find((s) => slotLabel(s.hour, s.minute) === time);
  if (!validSlot) {
    return res.status(400).json({ error: 'invalid_time' });
  }

  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ error: 'invalid_name' });
  }
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  if (!PHONE_RE.test(phone)) {
    return res.status(400).json({ error: 'invalid_phone' });
  }

  let calendar, calendarId;
  try {
    ({ calendar, calendarId } = getCalendarClient());
  } catch (err) {
    console.error('Calendar config error:', err.message);
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  const startISO = isoAt(parsed.year, parsed.month, parsed.day, validSlot.hour, validSlot.minute);
  const startMs = new Date(startISO).getTime();
  const endMs = startMs + SLOT_MINUTES * 60000;
  const endMinuteTotal = validSlot.hour * 60 + validSlot.minute + SLOT_MINUTES;
  const endHour = Math.floor(endMinuteTotal / 60);
  const endMinute = endMinuteTotal % 60;
  const endISO = isoAt(parsed.year, parsed.month, parsed.day, endHour, endMinute);

  try {
    const freebusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: startISO,
        timeMax: endISO,
        timeZone: TIMEZONE,
        items: [{ id: calendarId }],
      },
    });

    const busy = (freebusy.data.calendars &&
      freebusy.data.calendars[calendarId] &&
      freebusy.data.calendars[calendarId].busy) || [];
    const isTaken = busy.some((b) => {
      const bStart = new Date(b.start).getTime();
      const bEnd = new Date(b.end).getTime();
      return bStart < endMs && bEnd > startMs;
    });

    if (isTaken) {
      return res.status(409).json({ error: 'slot_taken' });
    }

    await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `Call Eleven Code — ${name}`,
        description:
          `Marcação feita através do site Eleven Code.\n\n` +
          `Nome: ${name}\nEmail: ${email}\nTelefone: ${phone}`,
        start: { dateTime: startISO, timeZone: TIMEZONE },
        end: { dateTime: endISO, timeZone: TIMEZONE },
      },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Booking error:', err.message);
    return res.status(500).json({ error: 'booking_failed' });
  }
};
