/**
 * Hora civil de Cuba para tarificacion y laboratorios.
 * Cuba suspendio el cambio 2026-11-01 y mantiene UTC-4 hasta 2027-11-07.
 * Usa America/Havana fuera de la excepcion; no usa la hora local del dispositivo.
 * Esta compatibilidad se puede retirar cuando servidores y navegadores actualicen tzdb >= 2026f.
 */
const CONTINUOUS_DST_FROM = Date.parse('2026-11-01T04:00:00Z');
const CONTINUOUS_DST_UNTIL = Date.parse('2027-11-07T05:00:00Z');
const LOCAL_FROM = '2026-11-01T00:00';
const LOCAL_UNTIL = '2027-11-07T01:00';

function effectiveHavanaTimeZone(at: Date): string {
  const ms = at.getTime();
  return ms >= CONTINUOUS_DST_FROM && ms < CONTINUOUS_DST_UNTIL
    ? 'Etc/GMT+4'
    : 'America/Havana';
}

export function formatHavanaLocalInput(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: effectiveHavanaTimeZone(at),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const read = (key: string) => parts.find((part) => part.type === key)?.value ?? '';
  return `${read('year')}-${read('month')}-${read('day')}T${read('hour')}:${read('minute')}`;
}

export function initialHavanaTime(): string {
  return formatHavanaLocalInput(new Date());
}

export function havanaDateTimeToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const nominal = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(nominal)) return null;
  // Rechaza 30 de febrero, horas 24:xx y otras fechas normalizadas por Date.parse.
  if (new Date(nominal).toISOString().slice(0, 16) !== value) return null;

  // El 07-11-2027 00:00-00:59 ocurre dos veces tras el retorno previsto.
  // No inventar una de las dos instancias para una reserva: exigir gestion explicita.
  if (value >= '2027-11-07T00:00' && value < LOCAL_UNTIL) return null;

  if (value >= LOCAL_FROM && value < LOCAL_UNTIL) {
    const actual = new Date(nominal + 4 * 60 * 60 * 1000);
    return formatHavanaLocalInput(actual) === value ? actual.toISOString() : null;
  }

  // Calendario normal fuera de la excepcion, incluyendo posteriores decisiones oficiales.
  const offsetFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Havana',
    timeZoneName: 'shortOffset',
  });
  let actual = nominal;
  for (let i = 0; i < 3; i++) {
    const name = offsetFormatter.formatToParts(new Date(actual))
      .find((part) => part.type === 'timeZoneName')?.value;
    const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(name ?? '');
    if (!match) return null;
    const minutes = (match[1] === '+' ? 1 : -1) *
      (Number(match[2]) * 60 + Number(match[3] ?? '0'));
    actual = nominal - minutes * 60_000;
  }
  if (formatHavanaLocalInput(new Date(actual)) !== value) return null;
  return new Date(actual).toISOString();
}
