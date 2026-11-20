// FIT-Dateien mit dem offiziellen Garmin-SDK lesen.
import { Decoder, Stream, Profile } from '@garmin/fitsdk';

const SEMI = 180 / 2 ** 31;
const WARMUP_MIN_S = 30;       // aktive Sätze länger als 30 s gelten als Aufwärmen
const ROUND_GAP_S = 15;        // grössere Pause zwischen zwei Intervallen = neue Runde

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

function buildSets(setMesgs, records) {
  const hr = records.filter((r) => r.heartRate != null).map((r) => [r.timestamp.getTime(), r.heartRate]);
  const out = [];
  let round = 0, pos = 0, restsSince = 0, lastEnd = null;
  for (const m of setMesgs) {
    if (m.setType !== 'active') { restsSince++; continue; }
    const st = m.startTime;
    const dur = m.duration ?? 0;
    const category = Array.isArray(m.category) ? m.category[0] : m.category;
    const sub = Array.isArray(m.categorySubtype) ? m.categorySubtype[0] : m.categorySubtype;
    if (!category || category === 'unknown') { restsSince = 0; continue; }
    let r;
    if (dur > WARMUP_MIN_S || category === 'warmUp') {
      r = 0;
    } else {
      const gap = lastEnd ? (st - lastEnd) / 1000 : Infinity;
      if (round === 0 || restsSince >= 2 || gap > ROUND_GAP_S) { round++; pos = 0; }
      r = round;
    }
    const t0 = st.getTime(), t1 = t0 + dur * 1000;
    const inSet = hr.filter(([t]) => t >= t0 && t <= t1).map(([, v]) => v);
    out.push({
      idx: out.length,
      round: r,
      pos: r === 0 ? null : pos++,
      start_time: st.toISOString(),
      duration_s: dur,
      exercise: `${category}:${sub ?? ''}`,
      category,
      exercise_name: sub != null ? exerciseName(category, sub) : null,
      reps: m.repetitions > 0 ? m.repetitions : null,
      avg_hr: inSet.length ? inSet.reduce((a, b) => a + b, 0) / inSet.length : null,
      max_hr: inSet.length ? Math.max(...inSet) : null
    });
    lastEnd = new Date(t1);
    restsSince = 0;
  }
  return out;
}
