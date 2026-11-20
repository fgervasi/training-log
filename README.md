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

# Notion: Trainingsplan, Übungsvariation und Übungen. Gibt die gefundenen Felder aus.
npm run sync:notion
```

Die drei Notion-Datenbanken müssen mit der Integration verbunden sein (in Notion: ··· → Connections).

## App starten

```bash
npm run dev                 # http://localhost:5180
```

| Seite | Inhalt |
|---|---|
| Übersicht | Kilometer und Tabata-Einheiten pro Woche, letzte Aktivitäten |
| Läufe | Routen werden automatisch erkannt (umbenennbar). Zeit im Verlauf, Fitness als Meter pro Herzschlag, Pace gegen Puls |
| Lauf-Detail | Karte (swisstopo), Höhenprofil, Pace und Puls entlang der Strecke, Vergleich mit einem anderen Lauf, Kilometerzeiten |
| Tabata | Wiederholungen pro Intervall je Übung über die Zeit, Programme, alle Einheiten |
| Tabata-Detail | Raster Runde × Übung, Vergleich mit der vorigen Einheit desselben Programms, Puls pro Intervall, Eintrag aus dem Notion-Trainingsplan |
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
