// FIT-Dateien mit dem offiziellen Garmin-SDK lesen.
import { Decoder, Stream, Profile } from '@garmin/fitsdk';

const SEMI = 180 / 2 ** 31;
const WARMUP_MIN_S = 30;       // aktive Sätze länger als 30 s gelten als Aufwärmen

export function exerciseName(category, subtype) {
  const table = Profile.types[`${category}ExerciseName`];
  return (table && table[subtype]) || null;
}

/**
 * @returns {null | {type:'run'|'tabata', session:object, points?:object[], sets?:object[]}}
 */
export function parseFit(buffer) {
  const stream = Stream.fromBuffer(buffer);
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) return null;
  const { messages } = decoder.read({
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
    applyScaleAndOffset: true,
    expandComponents: true,
    mergeHeartRates: true
  });
  const s = messages.sessionMesgs?.[0];
  if (!s) return null;
  const records = messages.recordMesgs || [];
  const start = s.startTime;
  const session = {
    start_time: start,
    duration_s: s.totalTimerTime ?? null,
    distance_m: s.totalDistance || null,
    avg_hr: s.avgHeartRate ?? null,
    max_hr: s.maxHeartRate ?? null,
    ascent_m: s.totalAscent ?? null,
    avg_speed: s.enhancedAvgSpeed || s.avgSpeed || null,
    training_effect: s.totalTrainingEffect ?? null
  };

  if (s.sport === 'running') {
    const points = [];
    for (const r of records) {
      if (r.positionLat == null || r.positionLong == null) continue;
      points.push({
        t: (r.timestamp - start) / 1000,
        lat: r.positionLat * SEMI,
        lon: r.positionLong * SEMI,
        alt_m: r.enhancedAltitude ?? r.altitude ?? null,
        hr: r.heartRate ?? null,
        speed: r.enhancedSpeed ?? r.speed ?? null,
        dist_m: r.distance ?? null
      });
    }
    if (points.length < 30) return null;
    return { type: 'run', session, points };
  }

  const setMesgs = messages.setMesgs || [];
  if ((s.sport === 'hiit' || s.sport === 'training') && setMesgs.some((m) => m.setType === 'active')) {
    return { type: 'tabata', session, sets: buildSets(setMesgs, records) };
  }
  return null;
}

const SEGMENT_GAP_S = 40;      // längere Pause zwischen zwei Intervallen = neuer Abschnitt (z. B. Zirkel -> Kraftblock)

/**
 * Teilt eine Folge von Übungen in Runden: Eine Runde beginnt, wenn die erste Übung wiederkommt.
 * Hängt an eine Runde mehr an als in der ersten Runde (z. B. danach noch 2 × Curl), wird der Rest
 * als eigene Folge behandelt.
 */
export function splitRounds(seq) {
  if (!seq.length) return [];
  const first = seq[0];
  const rounds = [];
  let cur = [];
  seq.forEach((item, i) => {
    if (i > 0 && item.exercise === first.exercise && seq[i - 1].exercise !== first.exercise) { rounds.push(cur); cur = []; }
    cur.push(item);
  });
  rounds.push(cur);
  const base = rounds[0].map((x) => x.exercise);
  const out = [rounds[0]];
  for (const r of rounds.slice(1)) {
    const prefixMatches = r.length > base.length && base.every((e, i) => r[i].exercise === e);
    if (prefixMatches) { out.push(r.slice(0, base.length)); out.push(...splitRounds(r.slice(base.length))); }
    else out.push(r);
  }
  return out;
}

function buildSets(setMesgs, records) {
  const hr = records.filter((r) => r.heartRate != null).map((r) => [r.timestamp.getTime(), r.heartRate]);
  const items = [];
  for (const m of setMesgs) {
    if (m.setType !== 'active') continue;
    const category = Array.isArray(m.category) ? m.category[0] : m.category;
    const sub = Array.isArray(m.categorySubtype) ? m.categorySubtype[0] : m.categorySubtype;
    if (!category || category === 'unknown') continue;
    const st = m.startTime, dur = m.duration ?? 0;
    const t0 = st.getTime(), t1 = t0 + dur * 1000;
    const inSet = hr.filter(([t]) => t >= t0 && t <= t1).map(([, v]) => v);
    items.push({
      start_time: st.toISOString(), t0, t1, duration_s: dur,
      warm: dur > WARMUP_MIN_S || category === 'warmUp',
      exercise: `${category}:${sub ?? ''}`, category,
      exercise_name: sub != null ? exerciseName(category, sub) : null,
      reps: m.repetitions > 0 ? m.repetitions : null,
      avg_hr: inSet.length ? inSet.reduce((a, b) => a + b, 0) / inSet.length : null,
      max_hr: inSet.length ? Math.max(...inSet) : null
    });
  }
  // Arbeitsintervalle in Abschnitte (lange Pause) und diese in Runden teilen
  const segments = [];
  let seg = [], lastEnd = null;
  for (const it of items) {
    if (it.warm) continue;
    if (lastEnd != null && (it.t0 - lastEnd) / 1000 > SEGMENT_GAP_S) { segments.push(seg); seg = []; }
    seg.push(it); lastEnd = it.t1;
  }
  if (seg.length) segments.push(seg);
  let round = 0;
  for (const s of segments) for (const r of splitRounds(s)) { round++; r.forEach((it, pos) => { it.round = round; it.pos = pos; }); }

  return items.map((it, idx) => ({
    idx, round: it.warm ? 0 : it.round, pos: it.warm ? null : it.pos,
    start_time: it.start_time, duration_s: it.duration_s, exercise: it.exercise, category: it.category,
    exercise_name: it.exercise_name, reps: it.reps, avg_hr: it.avg_hr, max_hr: it.max_hr
  }));
}

/** Nur die Sätze neu berechnen (für die Neuverarbeitung gespeicherter FIT-Dateien) */
export function parseSets(buffer) {
  const res = parseFit(buffer);
  return res?.type === 'tabata' ? res.sets : null;
}
