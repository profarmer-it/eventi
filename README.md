# Eventi Pro Farmer · eventi.profarmer.it

Le pagine di iscrizione agli eventi di Pro Farmer. Dal 5/11/2026, prima erano
su riposa.profarmer.it, che però è l'app di piùLact e con gli eventi non c'entra.

- Repository `profarmer-it/eventi`, pubblicato con GitHub Pages dal ramo `main`
  (record CNAME `eventi` → `profarmer-it.github.io` su SiteGround).
- Una cartella per evento (`mammella/`, …), la home `index.html` li elenca.
- `assets/`: icone Pro Farmer, logo bianco, font Inter. Le pagine li prendono
  da `../assets/`.
- Anteprima sul Mac: configurazione `eventi` in `~/Claude/.claude/launch.json`,
  http://localhost:8780.
- **Prima di pubblicare: anteprima e via di Giulio.**

## Le iscrizioni

Non stanno qui: le pagine chiamano la funzione Supabase `iscrizione-evento`
(progetto «riposa», sorgente in
`piùLact/Riposa interno/integrazioni/supabase/functions/iscrizione-evento/`).
Tabelle `eventi` ed `eventi_iscrizioni` (`53-eventi-iscrizioni.sql`, permessi
stretti in `88`).

## Il cruscotto degli iscritti: `/gestione/` (dal 19/11/2026)

`eventi.profarmer.it/gestione/` (prima era un riquadro nel Cruscotto di Riposa
Pro, tolto il 19/11). Si entra con l'account di Pro Farmer di Riposa Pro
(e-mail e password, anti-robot Cloudflare: il nome `eventi.profarmer.it` deve
stare nel widget «Easy e Riposa Pro»; dal browser interno dell'app Claude il
controllo non passa). Il database dà i dati solo agli interni (`sono_interno()`).
Per evento: iscritti sui posti, lista d'attesa, pranzo (con le allergie),
visita, altri dell'azienda, presenti, ruoli; elenco con ricerca, filtri e
ordine; «Segna presente» il giorno dell'evento (per gli attestati); Excel
(CSV con «;», i testi che iniziano con = + - @ hanno una tabulazione davanti).
`#codice` nell'indirizzo apre quell'evento. File: `gestione/` più
`assets/antirobot.js` e `assets/vendor/supabase-2.45.4.js` (uguali a Riposa).
CSP stretta: script solo dal sito e da Cloudflare, connessioni solo a Supabase.
Banco di prova con iscritti inventati: `Eventi/collaudo-gestione/` (in
`profarmer-cloud`), anteprima `eventi-gestione` su http://localhost:8781/collaudo-gestione/
(`?accesso`, `?vuoto`, `?errore`; password di prova «prova»). Le e-mail partono da
`Pro Farmer Eventi <eventi@profarmer.it>`, le risposte vanno a info@profarmer.it.

## Un evento nuovo, passo per passo

1. **Materiali** in `Eventi/<Nome evento AAAA-MM-GG>/` (cartella in
   `profarmer-cloud`): copiare `genera.py`, `evento.css`, `locandina_A4.html`,
   `carosello.html`, `storie.html`, `video_storia.html`, `copertina.html`,
   `prepara_fondi.py`, `audio.py` dalla mattinata del 4/12 e cambiare testi,
   foto e colori. `python3 genera.py` fa PDF e PNG, `python3 genera.py video`
   anche il video.
2. **Pagina:** copiare `mammella/` in una cartella nuova con un nome breve
   (`/serata/`, `/vitelli/`…), cambiare testi, foto, `og:` e `canonical`, e la
   costante `EVENTO` nello script con il codice nuovo. Aggiungere il riquadro
   nella home `index.html`.
3. **Database:** una riga in `eventi`
   (`codice`, `titolo`, `quando`, `posti`, `chiude_il`), per esempio
   `vitelli-2027-02-10`. Il codice inizia col nome della cartella: il cruscotto
   ne ricava il link alla pagina di iscrizione. Se servono domande diverse (pranzo, visita…), vanno
   viste nella funzione e nella tabella.
4. **Funzione:** aggiungere i testi dell'evento nella costante `EVENTI`
   (titolo, data, luogo, mappa, calendario, tag ActiveCampaign) e ripubblicarla
   (`verify_jwt: false`), dopo aver confrontato la copia locale con quella online.
5. **QR** della locandina verso `https://eventi.profarmer.it/<cartella>/`
   (rileggerlo dopo averlo generato).
6. Anteprima, via di Giulio, push su `main`.
7. A evento finito: togliere il riquadro dalla home (la pagina può restare con
   «iscrizioni chiuse»: lo fa da sola dopo `chiude_il`).
