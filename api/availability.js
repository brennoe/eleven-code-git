const {
  TIMEZONE,
  SLOT_MINUTES,
  MIN_NOTICE_MINUTES,
  getCalendarClient,
  isoAt,
  nowInLisbon,
  parseDateParam,
  isDateBookable,
  buildSlotStarts,
  slotLabel,
} = require('./_calendar');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const dateParam = typeof req.query.date === 'string' ? req.query.date : '';
  const parsed = parseDateParam(dateParam);

  if (!parsed) {
    return res.status(400).json({ error: 'invalid_date' });
  }

  if (!isDateBookable(parsed)) {
    return res.status(200).json({ date: dateParam, slots: [] });
  }

  let calendar, calendarId;
  try {
    ({ calendar, calendarId } = getCalendarClient());
  } catch (err) {
    console.error('Calendar config error:', err.message);
    return res.status(500).json({ error: 'server_misconfigured' });
  }

  const dayStart = isoAt(parsed.year, parsed.month, parsed.day, 9, 0);
  const dayEnd = isoAt(parsed.year, parsed.month, parsed.day, 18, 0);

  try {
    const freebusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: dayStart,
        timeMax: dayEnd,
        timeZone: TIMEZONE,
        items: [{ id: calendarId }],
      },
    });

    const busy = (freebusy.data.calendars &&
      freebusy.data.calendars[calendarId] &&
      freebusy.data.calendars[calendarId].busy) || [];
    const busyIntervals = busy.map((b) => ({
      start: new Date(b.start).getTime(),
      end: new Date(b.end).getTime(),
    }));

    const now = nowInLisbon();
    const nowMinutesTotal =
      Date.UTC(now.year, now.month - 1, now.day) === Date.UTC(parsed.year, parsed.month - 1, parsed.day)
        ? now.hour * 60 + now.minute + MIN_NOTICE_MINUTES
        : null;

    const slots = buildSlotStarts()
      .filter((slot) => {
        if (nowMinutesTotal !== null && slot.hour * 60 + slot.minute < nowMinutesTotal) {
          return false;
        }
        return true;
      })
      .map((slot) => {
        const startISO = isoAt(parsed.year, parsed.month, parsed.day, slot.hour, slot.minute);
        const startMs = new Date(startISO).getTime();
        const endMs = startMs + SLOT_MINUTES * 60000;
        return { slot, startMs, endMs };
      })
      .filter(({ startMs, endMs }) => {
        return !busyIntervals.some((b) => b.start < endMs && b.end > startMs);
      })
      .map(({ slot }) => ({ start: slotLabel(slot.hour, slot.minute) }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ date: dateParam, slots });
  } catch (err) {
    console.error('Availability error:', err.message);
    return res.status(500).json({ error: 'availability_failed' });
  }
};
