// Eine Einheit in Blöcke teilen: aufeinanderfolgende Runden mit derselben Übungsfolge
// (z. B. 3 Runden Zirkel à 9 Übungen, danach 2 Runden Kraftblock à 4 Übungen).
export function toBlocks(sets) {
  const byRound = new Map();
  for (const s of sets) {
    if (!(s.round > 0)) continue;
    if (!byRound.has(s.round)) byRound.set(s.round, []);
    byRound.get(s.round).push(s);
  }
  const blocks = [];
  for (const [round, ss] of byRound) {
    ss.sort((a, b) => a.pos - b.pos);
    const seq = ss.map((s) => s.exercise);
    const last = blocks.at(-1);
    // gleiche Folge oder abgebrochene Runde (Anfang der Folge) gehört zum selben Block
    if (last && seq.every((e, i) => last.seq[i] === e)) last.rounds.push({ round, sets: ss });
    else blocks.push({ seq, sig: seq.join('|'), rounds: [{ round, sets: ss }] });
  }
  return blocks.map((b, i) => ({ ...b, no: i + 1, slots: b.seq.map((exercise, pos) => ({ pos, exercise })) }));
}

export const blockSummary = (blocks) => blocks.map((b) => `${b.rounds.length} × ${b.seq.length}`).join(' + ');
