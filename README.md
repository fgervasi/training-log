# Training Log

Läufe und Tabata-Einheiten aus Garmin vergleichen, ergänzt um Trainingsplan und Übungen aus Notion.
Läuft nur lokal auf dem Mac. Alle Daten liegen in `data/` (nicht im Repo).

## Setup

```bash
npm install
cp .env.example .env        # NOTION_API_KEY eintragen (z. B. derselbe wie in notion-hub)
```

Node 20.6 oder neuer. Mit pnpm geht es genauso (`pnpm install`): Die nötige Freigabe für die native SQLite-Datei steht in `pnpm-workspace.yaml` (`allowBuilds`).

## Daten holen

```bash
# Garmin: ZIP, Ordner oder einzelne .fit-Dateien. Bereits importierte Dateien werden übersprungen.
npm run import -- ~/Downloads/<garmin-export>/DI_CONNECT/DI-Connect-Uploaded-Files

# Garmin laufend: neue Aktivitäten seit der letzten importierten über die Personal API (GARMIN_API_KEY in .env).
# --dry-run zeigt nur an, was geladen würde; --since YYYY-MM-DD wählt den Startpunkt.
npm run sync:garmin

# Notion: Trainingsplan, Übungsvariation und Übungen. Gibt die gefundenen Felder aus.
npm run sync:notion
```

Die drei Notion-Datenbanken müssen mit der Integration verbunden sein (in Notion: ··· → Connections).

## App starten

```bash
npm run dev                 # http://localhost:5180

# oder als gebaute App
npm run build && npm start  # http://localhost:3000
```

Die Übersicht holt neue Aktivitäten aus Garmin und Notion automatisch, wenn der letzte Sync älter als 6 Stunden ist, oder per Knopf „Neue Aktivitäten holen“.

| Seite | Inhalt |
|---|---|
| Übersicht | Sync mit Garmin und Notion, Kilometer und Tabata-Einheiten pro Woche, letzte Aktivitäten |
| Läufe | Routen werden automatisch erkannt (umbenennbar). Zeit im Verlauf, Fitness als Meter pro Herzschlag, Pace gegen Puls, Intervalle (Verlauf je Belastungsintervall), Zeit im Zielpuls-Bereich, Abschnittszeiten über alle Läufe |
| Lauf-Detail | Karte (swisstopo), Höhenprofil, Pace und Puls entlang der Strecke, Vergleich mit einem anderen Lauf, Runden/Intervalle aus dem Garmin-Workout, Kilometerzeiten. Zwei Klicks ins Höhenprofil legen einen Abschnitt an |
| Tabata | Wiederholungen pro Intervall je Übung über die Zeit, Programme, alle Einheiten |
| Tabata-Detail | Blöcke mit Raster Runde × Übung, Zählfehler durchgestrichen, Vergleich mit der vorigen Einheit desselben Programms, Puls pro Intervall, Eintrag aus dem Notion-Trainingsplan |
| Pläne | Plan gegen Ist: Kraftpläne (Übungen gemacht, Trend, Übungen ausserhalb des Plans) und Laufpläne (Läufe pro Woche, Intervalle, Zielpuls) |
| Übungen | Garmin-Übung einmal einer Notion-Übung zuordnen oder umbenennen |

## Aufbau

```
scripts/import.js            Garmin-Import (CLI)
scripts/sync-notion.js       Notion-Sync (CLI)
src/lib/server/db.js         SQLite-Schema (data/training.db)
src/lib/server/fit.js        FIT lesen (@garmin/fitsdk), Runden/Positionen der Tabata-Sätze
src/lib/server/routes-detect.js  Läufe per Rasterzellen-Überlappung einer Route zuordnen
src/lib/server/notion.js     Notion-Datenbanken generisch laden (Feldnamen aus dem Schema)
src/lib/server/notion-links.js   Relationen auflösen, Trainingsplan per Datum finden
src/routes/                  SvelteKit-Seiten
```

Neu aufbauen: `data/training.db` löschen und erneut importieren. Die Rohdateien liegen unter `data/raw/`.
