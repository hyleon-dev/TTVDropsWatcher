# TTV Drops Watcher

Tampermonkey-Userscript für Twitch: Auf einer Kategorie-Seite (`/directory/category/...`)
erscheint ein Button. Ein Klick wählt zufällig einen der Top-10-Kanäle dieser Kategorie
aus und öffnet ihn. Solange der Watcher aktiv ist, wird der Kanal regelmäßig geprüft
(Standard: alle 30 Sekunden). Geht er offline oder wechselt er die Kategorie, springt
das Script automatisch zu einem neuen zufälligen Top-10-Kanal.

Die Kanal- und Kategorie-Daten kommen über die offizielle Twitch-Helix-API, nicht über
Reverse Engineering der Twitch-Webseite. Das braucht einmalig eigene API-Zugangsdaten
(kostenlos, siehe unten).

## Installation

1. Tampermonkey installieren (Firefox/Chrome/Edge).
2. In Tampermonkey ein neues Script anlegen und den Inhalt von
   `ttv-drops-watcher.user.js` einfügen, oder die Datei per Doppelklick öffnen,
   falls Tampermonkey das `.user.js`-Format erkennt.
3. Twitch-API-Zugangsdaten anlegen (einmalig, kostenlos):
   - Auf https://dev.twitch.tv/console mit dem Twitch-Account einloggen.
   - "Register Your Application" klicken.
   - Name frei wählbar, OAuth Redirect URL `https://localhost`, Category z. B. "Application Integration".
   - Nach dem Anlegen: Client-ID kopieren, und über "New Secret" ein Client Secret erzeugen.
4. Auf einer beliebigen Twitch-Seite über das Tampermonkey-Icon im Browser
   "TTV Watcher: API Zugangsdaten setzen" wählen und Client-ID sowie Client-Secret
   eintragen.

## Benutzung

1. Zu einer Kategorie-Seite navigieren, z. B. `twitch.tv/directory/category/valorant`.
2. Unten rechts erscheint der Button "🎲 Random Top 10". Klicken.
3. Die erkannte Kategorie wird zur Bestätigung angezeigt (bei Bedarf korrigieren).
4. Danach wird nach einer Laufzeit in Stunden gefragt. Leer lassen oder `0` eingeben
   heißt: kein Zeitlimit, läuft bis zum manuellen Stoppen.
5. Das Script öffnet einen zufälligen Kanal aus den Top 10 dieser Kategorie.
6. Unten rechts erscheint ein kleines Status-Fenster mit einem "Stop"-Button und,
   falls ein Zeitlimit gesetzt wurde, der geplanten Endzeit. Solange das Fenster da
   ist, läuft die automatische Überwachung.
7. Geht der Kanal offline oder wechselt die Kategorie, wählt das Script automatisch
   einen neuen Kanal aus den aktuellen Top 10 (kein Kanal wird doppelt gewählt, bis
   alle zehn einmal dran waren).
8. Ist die eingestellte Laufzeit abgelaufen, stoppt das Script sich selbst.
9. Zum vorzeitigen Beenden auf "Stop" klicken, oder im Tampermonkey-Menü
   "TTV Watcher: Stoppen" wählen.

## Konfiguration

Am Anfang von `ttv-drops-watcher.user.js` im `CONFIG`-Objekt:

- `topN`: wie viele Top-Kanäle als Auswahl gelten (Standard 10).
- `pollIntervalMs`: wie oft der aktuelle Kanal geprüft wird (Standard 30000 ms).

## Bekannte Einschränkungen

- Die App-Zugangsdaten sind pro Browser-Profil in Tampermonkey gespeichert, nicht
  im Twitch-Account. Andere Geräte brauchen eine eigene Einrichtung.
- Ein Kanalwechsel lädt die Twitch-Seite neu (`location.href`), es gibt keinen
  nahtlosen SPA-Wechsel ohne Reload.
- Werbe-Unterbrechungen (Pre-Roll/Mid-Roll) werden nicht als "offline" erkannt,
  da die Helix-API weiterhin einen aktiven Stream meldet.
