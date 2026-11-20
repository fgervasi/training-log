# Training Log – Anforderungen (Entwurf)

Ziel: Läufe und Krafttrainings aus Garmin über die Zeit vergleichen können, ergänzt um die Übungen aus Notion. Single-User, nur für mich.

## Datenquellen

| Quelle | Was drin ist | Stand |
|---|---|---|
| Garmin FIT-Dateien | Läufe: GPS, Höhe (barometrisch), Puls, Pace, Kadenz. Kraft (als HIIT erfasst): einzelne Sätze mit Zeit, Dauer, Übungskategorie, Wiederholungen | Im Export vorhanden: 69 Läufe, 56 Krafteinheiten mit je ~40 Sätzen. Wiederholungen bei ~2/3 der Sätze, **Gewicht nie** |
| Garmin `summarizedActivities.json` | Zusammenfassung pro Aktivität: Distanz, Dauer, Ø-Puls, Trainingseffekt, VO2max | Im Export vorhanden |
| Garmin Personal API | Neue Aktivitäten als JSON + FIT, laufend | Token in Garmin Connect prüfen; ob VO2max u. ä. enthalten sind, ist offen |
| Notion | Tabata-Programme (#14, #15, …) mit ihren Übungen. Zugriff über die bestehende Integration aus `notion-hub` | Wo genau die Übungen pro Tabata stehen, noch klären |

Folgerung: Das Krafttraining ist Tabata mit Körpergewicht. Gewicht spielt keine Rolle. Fortschritt zeigt sich an Wiederholungen pro 20-s-Intervall, am Abfall vom ersten zum achten Intervall und am Puls. Eine Einheit mit ~40 aktiven Sätzen entspricht 5 Blöcken à 8 Intervallen.

## Use Cases

### Laufen
- **L1 Verlauf auf derselben Strecke:** Alle Läufe einer Route (z. B. Morgenrunde 4 km) als Zeitreihe: Zeit, Pace, Ø-Puls.
- **L2 Fitness-Trend:** Puls bei gleichem Tempo (bzw. Pace bei gleichem Puls) über Wochen.
- **L3 Abschnittszeiten:** Zeit für einen bestimmten Abschnitt, z. B. den Anstieg km 0,8–1,3, über alle Läufe.
- **L4 Zwei Läufe nebeneinander:** Profil, Pace und Puls entlang der Strecke überlagert.
- **L5 Routen erkennen:** Läufe automatisch einer Route zuordnen (ohne manuelles Taggen).

### Kraft
- **K1 Fortschritt pro Übung:** Wiederholungen pro Intervall pro Übung über die Zeit, plus Abfall innerhalb eines Blocks (Intervall 1 vs. 8).
- **K2 Einheit im Detail:** Welche Übungen, wie viele Sätze, Puls pro Übung.
- **K3 Programm-Vergleich:** Tabata #14 vs. #15: welches Programm, wie oft, wie viele Wiederholungen.
- **K4 Übungs-Mapping:** Notion-Übung ↔ Garmin-Kategorie einmal zuordnen, danach automatisch.

### Allgemein
- **A1 Import:** Neue Aktivitäten ohne Handarbeit übernehmen (erst Export, später Personal API).
- **A2 Wochenübersicht:** Umfang pro Woche (Läufe, Kraft), Regelmässigkeit.

## Nicht-Ziele (vorerst)
- Kein Mehrbenutzer, kein Login, nur lokal auf dem Mac
- Kein Gewicht erfassen
- Keine Daten zurück an Garmin
- Kein Ersatz für Garmin Connect (Schlaf, Stress, Wellness bleiben dort)

## Datenbank – Vorschlag

**SQLite, lokal auf dem Mac**, Datei unter `data/training.db` (per `.gitignore` nicht im Repo).

- Kein Server, kein Betrieb, Python hat SQLite eingebaut.
- Daten bleiben privat auf dem eigenen Rechner. Backup über Time Machine.
- Für die Auswertungen (Zeitreihen, Abschnittszeiten) bei ein paar hundert Aktivitäten völlig ausreichend.
- Rohdaten (FIT) bleiben als Dateien unter `data/raw/`. Die DB lässt sich jederzeit neu daraus aufbauen.

Wann etwas anderes:
- **DuckDB**, wenn es vor allem Analyse werden soll (Parquet, schnelle Aggregationen). Kann SQLite-Dateien direkt lesen, also später ergänzbar.
- **Gehostetes Postgres** (Supabase, Neon), erst wenn die App unterwegs auf dem Handy laufen oder der Import automatisch in der Cloud laufen soll. Achtung: Garmin blockiert Zugriffe aus Cloud-Rechenzentren teilweise.

### Datenmodell (Entwurf)
```
activity        id, source_file, type (run|strength), start_time, duration_s,
                distance_m, avg_hr, max_hr, elevation_gain_m, route_id
run_point       activity_id, t, lat, lon, alt_m, hr, speed, dist_m   -- für L3/L4
route           id, name                                            -- L1/L5
strength_set    activity_id, idx, start_time, duration_s,
                garmin_category, garmin_exercise, reps, weight_kg, set_type
notion_exercise id (Notion-Page-ID), name, ...
exercise_map    notion_exercise_id, garmin_category, garmin_exercise
tabata_program  id (Notion-Page-ID), name ('Tabata #15'), exercises (Reihenfolge)
session_program activity_id, tabata_program_id                     -- per Datum aus dem Master Calendar
```

## Stack (entschieden / vorgeschlagen)
- **App:** SvelteKit (Node), läuft lokal mit `npm run dev`
- **DB:** SQLite über `better-sqlite3`
- **FIT-Import:** `@garmin/fitsdk` (offizielles Garmin-SDK für JavaScript)
- **Notion:** `@notionhq/client`, eigener Key in `.env` (wie in `notion-hub`)
- **Karte:** MapLibre GL JS mit swisstopo-Vektorkarten (Basiskarte hell bzw. Landeskarte, inkl. Waldwege und Höhenlinien)
- **Charts:** Observable Plot für Standarddiagramme, D3 für Spezialfälle (Profil-/Karten-Kopplung, Überlagerung zweier Läufe)

## Umsetzungsstand (v0.1)
- Umgesetzt: A1 (Import aus Export), A2, L1, L2 (Meter pro Herzschlag), L4, L5, K1, K2, K3 (Programme nach Übungsfolge, Name aus Notion), K4
- Offen: L3 Abschnittszeiten, Import über die Garmin Personal API
- Erkenntnis aus den Daten: Die Einheiten sind Zirkel aus 8–9 Übungen à 20/10 s in 5 Runden (nicht 8 Intervalle derselben Übung). Garmin speichert pro Satz Kategorie und Übungsname, z. B. `plank:34` = Mountain Climber.

## Offene Fragen
1. Wo in Notion stehen die Übungen eines Tabata-Programms (Seiteninhalt, eigene DB)?
2. Personal API Token in Garmin Connect schon verfügbar?
3. Welche Use Cases zuerst? Vorschlag: A1 + L1 + K1.
