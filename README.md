# TTV Drops Watcher

Tampermonkey-Userscript für Twitch: Ein Button lässt dich einen zufälligen der
Top-10-Kanäle einer Kategorie anschauen. Der Button erscheint an zwei Stellen:

- Auf einer Kategorie-Seite (`/directory/category/...`): wählt zufällig einen der
  Top-10-Kanäle dieser Kategorie aus und öffnet ihn.
- Auf einer Kanal-Seite, während du gerade einen Stream schaust: startet den
  Watcher direkt mit diesem Kanal und dessen aktueller Kategorie, ohne Wechsel.

Solange der Watcher aktiv ist, wird der Kanal regelmäßig geprüft (Standard: alle
30 Sekunden). Geht er offline oder wechselt er die Kategorie, springt das Script
automatisch zu einem neuen zufälligen Top-10-Kanal.

Die Kanal- und Kategorie-Daten kommen über die offizielle Twitch-Helix-API, nicht über
Reverse Engineering der Twitch-Webseite. Das braucht einmalig eigene API-Zugangsdaten
(kostenlos, siehe unten).

## Installation

1. Tampermonkey installieren (Firefox/Chrome/Edge).
2. Diese URL im Browser öffnen, Tampermonkey zeigt dann automatisch den
   Installationsdialog an:
   https://raw.githubusercontent.com/hyleon-dev/TTVDropsWatcher/main/ttv-drops-watcher.user.js
   (Alternative: Inhalt von `ttv-drops-watcher.user.js` manuell in ein neues
   Tampermonkey-Script einfügen. Der Effekt ist derselbe, solange der Header
   mit `@updateURL`/`@downloadURL` erhalten bleibt.)
3. Twitch-API-Zugangsdaten anlegen (einmalig, kostenlos):
   - Auf https://dev.twitch.tv/console mit dem Twitch-Account einloggen.
   - "Register Your Application" klicken.
   - Name frei wählbar, OAuth Redirect URL `https://localhost`, Category z. B. "Application Integration".
   - Nach dem Anlegen: Client-ID kopieren, und über "New Secret" ein Client Secret erzeugen.
4. Auf einer beliebigen Twitch-Seite über das Tampermonkey-Icon im Browser
   "TTV Watcher: API Zugangsdaten setzen" wählen und Client-ID sowie Client-Secret
   eintragen.

## Benutzung

Es gibt zwei Startpunkte:

**A) Von einer Kategorie-Seite aus** (z. B. `twitch.tv/directory/category/valorant`):

1. Unten rechts erscheint der Button "🎲 Random Top 10". Klicken.
2. Die erkannte Kategorie wird zur Bestätigung angezeigt (bei Bedarf korrigieren).
3. Danach wird nach einer Laufzeit in Stunden gefragt (siehe unten).
4. Das Script öffnet einen zufälligen Kanal aus den Top 10 dieser Kategorie.

**B) Von einem Kanal aus, den du gerade schaust** (z. B. `twitch.tv/irgendeinstreamer`):

1. Unten rechts erscheint der Button "🎲 Kategorie-Watcher starten". Klicken.
2. Das Script prüft die Kategorie, in der der Kanal gerade live ist, und fragt zur
   Bestätigung nach (Kanal muss live sein, sonst Fehlermeldung).
3. Danach wird nach einer Laufzeit in Stunden gefragt (siehe unten).
4. Es wird kein neuer Kanal geöffnet, der bereits laufende Kanal wird einfach zum
   Ausgangspunkt der Überwachung.

Ab hier läuft beides gleich:

- Bei der Laufzeit-Abfrage heißt leer lassen oder `0` eingeben: kein Zeitlimit,
  läuft bis zum manuellen Stoppen.
- Unten links erscheint ein kleines Status-Fenster mit einem "Stop"-Button und,
  falls ein Zeitlimit gesetzt wurde, der geplanten Endzeit. Solange das Fenster da
  ist, läuft die automatische Überwachung.
- Geht der Kanal offline oder wechselt die Kategorie, wählt das Script automatisch
  einen neuen Kanal aus den aktuellen Top 10 dieser Kategorie (kein Kanal wird
  doppelt gewählt, bis alle zehn einmal dran waren).
- Ist die eingestellte Laufzeit abgelaufen, stoppt das Script sich selbst.
- Zum vorzeitigen Beenden auf "Stop" klicken, oder im Tampermonkey-Menü
  "TTV Watcher: Stoppen" wählen.

## Konfiguration

Am Anfang von `ttv-drops-watcher.user.js` im `CONFIG`-Objekt:

- `topN`: wie viele Top-Kanäle als Auswahl gelten (Standard 10).
- `pollIntervalMs`: wie oft der aktuelle Kanal geprüft wird (Standard 30000 ms).

## Updates

Der Header enthält `@updateURL`/`@downloadURL`, die auf die Raw-Datei auf GitHub
zeigen. Tampermonkey prüft von selbst regelmäßig (Standard: täglich), ob sich dort
die `@version` erhöht hat, und bietet dann ein Update an. Sofortige Prüfung:
Tampermonkey-Dashboard -> Zahnrad/Utilities-Tab -> "Nach Updates suchen", oder im
Dashboard beim Script auf den Reload-Pfeil klicken.

Wichtig: Jede inhaltliche Änderung an `ttv-drops-watcher.user.js` braucht eine
höhere `@version`-Nummer, sonst erkennt Tampermonkey die Änderung nicht als Update.

## Bekannte Einschränkungen

- Die App-Zugangsdaten sind pro Browser-Profil in Tampermonkey gespeichert, nicht
  im Twitch-Account. Andere Geräte brauchen eine eigene Einrichtung.
- Ein Kanalwechsel lädt die Twitch-Seite neu (`location.href`), es gibt keinen
  nahtlosen SPA-Wechsel ohne Reload.
- Werbe-Unterbrechungen (Pre-Roll/Mid-Roll) werden nicht als "offline" erkannt,
  da die Helix-API weiterhin einen aktiven Stream meldet.
