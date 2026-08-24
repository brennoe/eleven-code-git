const { google } = require('googleapis');

const TIMEZONE = 'Europe/Lisbon';
const SLOT_MINUTES = 45;
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
const MIN_NOTICE_MINUTES = 120;
const MAX_DAYS_AHEAD = 30;

function getEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error('missing_env:' + name);
  return value;
}

function getCalendarClient() {
  const email = getEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const key = getEnv('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  const calendarId = getEnv('GOOGLE_CALENDAR_ID');

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return { calendar: google.calendar({ version: 'v3', auth }), calendarId };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// Returns the UTC offset of Europe/Lisbon ("+00:00" or "+01:00") for a given calendar date.
function lisbonOffset(year, month, day) {
  const approx = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    timeZoneName: 'shortOffset',
  }).formatToParts(approx);
  const tzPart = parts.find((p) => p.type === 'timeZoneName');
  const match = tzPart && tzPart.value.match(/GMT([+-]\d+)?/);
  const hours = match && match[1] ? parseInt(match[1], 10) : 0;
  const sign = hours >= 0 ? '+' : '-';
  return sign + pad(Math.abs(hours)) + ':00';
}

function isoAt(year, month, day, hour, minute) {
  const offset = lisbonOffset(year, month, day);
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${offset}`;
}

// "Now" expressed as Lisbon wall-clock parts.
function nowInLisbon() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const map = {};
  parts.forEach((p) => { map[p.type] = p.value; });
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
  };
}

function parseDateParam(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
  const [year, month, day] = dateStr.split('-').map((n) => parseInt(n, 10));
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, weekday: check.getUTCDay() };
}

function isDateBookable(parsed) {
  if (!parsed) return false;
  if (parsed.weekday === 0 || parsed.weekday === 6) return false;

  const now = nowInLisbon();
  const todayUTC = Date.UTC(now.year, now.month - 1, now.day);
  const targetUTC = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  const dayDiff = Math.round((targetUTC - todayUTC) / 86400000);

  if (dayDiff < 0 || dayDiff > MAX_DAYS_AHEAD) return false;
  return true;
}

function buildSlotStarts() {
  const starts = [];
  let totalMinutes = WORK_START_HOUR * 60;
  const endMinutes = WORK_END_HOUR * 60;
  while (totalMinutes + SLOT_MINUTES <= endMinutes) {
    starts.push({ hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 });
    totalMinutes += SLOT_MINUTES;
  }
  return starts;
}

function slotLabel(hour, minute) {
  return `${pad(hour)}:${pad(minute)}`;
}

module.exports = {
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
  pad,
};
