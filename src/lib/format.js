// Formatierung (Client und Server)
export const fmtDate = (iso) => new Date(iso).toLocaleDateString('de-CH', { timeZone: 'Europe/Zurich', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' });
export const fmtDur = (s) => {
  if (s == null) return '–';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
/** Pace aus m/s als min:ss pro km */
export const fmtPace = (mps) => {
  if (!mps) return '–';
  const spk = 1000 / mps;
  return `${Math.floor(spk / 60)}:${String(Math.round(spk % 60)).padStart(2, '0')}`;
};
export const paceMin = (mps) => (mps ? 1000 / mps / 60 : null);
export const fmtKm = (m) => (m == null ? '–' : (m / 1000).toFixed(2).replace('.', ','));
export const fmtNum = (v, d = 0) => (v == null ? '–' : Number(v).toFixed(d).replace('.', ','));
export const fmtDelta = (v, d = 0, unit = '') => (v == null ? '' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(d).replace('.', ',')}${unit}`);
/** 'mountainClimber' -> 'Mountain Climber' */
export const prettyExercise = (name) => (name ? name.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/([0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()) : 'Unbekannte Übung');
