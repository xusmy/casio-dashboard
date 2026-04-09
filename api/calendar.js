// Vercel serverless function — eventos próximos 7 días
// Calendarios configurados via variables de entorno (ver .env.example)

const TZ = 'Europe/Madrid';
const DIAS_ES = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

// Configuración de calendarios desde variables de entorno
const ICS_CALENDARS = [
  process.env.CAL_ICS_1 && { name: process.env.CAL_NAME_1 || 'Calendario 1', url: process.env.CAL_ICS_1 },
  process.env.CAL_ICS_2 && { name: process.env.CAL_NAME_2 || 'Calendario 2', url: process.env.CAL_ICS_2 },
].filter(Boolean);

function toESDateStr(date) {
  return new Date(date.toLocaleString('en-US', { timeZone: TZ })).toISOString().slice(0, 10);
}

function parseICSDate(str) {
  if (!str) return null;
  str = str.trim();
  if (str.length === 8) {
    return new Date(parseInt(str.slice(0, 4)), parseInt(str.slice(4, 6)) - 1, parseInt(str.slice(6, 8)));
  }
  var y = str.slice(0, 4), mo = str.slice(4, 6), d = str.slice(6, 8), h = str.slice(9, 11), mi = str.slice(11, 13), s = str.slice(13, 15);
  return new Date(y + '-' + mo + '-' + d + 'T' + h + ':' + mi + ':' + s + (str.endsWith('Z') ? 'Z' : '+01:00'));
}

function parseICS(icsText, calName) {
  var events = [];
  var lines = icsText.replace(/\r\n[ \t]/g, '').split(/\r\n|\r|\n/);
  var current = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line === 'BEGIN:VEVENT') {
      current = {};
    } else if (line === 'END:VEVENT' && current) {
      var start = current.dtstart;
      if (start) {
        var startDate = parseICSDate(start);
        if (startDate) {
          var startStr = toESDateStr(startDate);
          var isAllDay = start.length === 8;
          events.push({
            title: current.summary || '(sin título)',
            date: startStr,
            dayLabel: DIAS_ES[startDate.getDay()],
            dateNum: startStr.slice(8, 10) + '/' + startStr.slice(5, 7),
            start: isAllDay ? null : startDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ }),
            allDay: isAllDay,
            calendar: calName,
            sortKey: startStr + (isAllDay ? 'T00:00' : startDate.toISOString().slice(10))
          });
        }
      }
      current = null;
    } else if (current !== null) {
      var colon = line.indexOf(':');
      if (colon > 0) {
        var key = line.slice(0, colon).split(';')[0].toLowerCase().replace(/-/g, '');
        var value = line.slice(colon + 1).trim();
        current[key] = value;
      }
    }
  }
  return events;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const secret = process.env.DASH_SECRET;
  if (secret && req.query.secret !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    let allEvents = [];

    // Intentar leer calendarios externos
    for (const cal of ICS_CALENDARS) {
      try {
        const resp = await fetch(cal.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (resp.ok) {
          const text = await resp.text();
          allEvents = allEvents.concat(parseICS(text, cal.name));
        }
      } catch (e) {
        console.error('Error cargando ' + cal.name, e.message);
      }
    }

const todayStr = toESDateStr(new Date());
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + 7); // Volvemos a los 7 días
    const limitStr = toESDateStr(limitDate);

    // Filtrar por fecha
    let filtered = allEvents.filter(ev => ev.date >= todayStr && ev.date <= limitStr);

    // EVENTO DE SEGURIDAD: Si no hay nada, añadimos este para confirmar que el código funciona
    if (filtered.length === 0) {
      filtered.push({
        title: "SISTEMA ONLINE - SIN EVENTOS",
        date: todayStr,
        dayLabel: DIAS_ES[new Date().getDay()],
        dateNum: todayStr.slice(8, 10) + '/' + todayStr.slice(5, 7),
        start: "00:00",
        allDay: true,
        calendar: "Dashboard",
        sortKey: todayStr + "T00:00"
      });
    }

    filtered.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    res.status(200).json({
      events: filtered,
      count: filtered.length,
      today: todayStr
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
