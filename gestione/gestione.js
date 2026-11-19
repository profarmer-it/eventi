/* ==========================================================================
   Eventi Pro Farmer · gestione (eventi.profarmer.it/gestione/), dal 19/11/2026.
   --------------------------------------------------------------------------
   Il cruscotto degli iscritti agli eventi, fuori da Riposa Pro (Giulio, 19/11:
   Riposa Pro serve solo a vendite, clienti, agenti e rivenditori).
   Per evento: numeri (iscritti, lista d'attesa, pranzo, visita, presenti),
   ruoli, elenco con ricerca e filtri, «Presente» da segnare il giorno
   dell'evento (serve per gli attestati) ed elenco da scaricare per Excel.

   Sicurezza: la pagina non contiene dati. Accesso con l'account Supabase di
   Pro Farmer (e-mail e password come in Riposa Pro, controllo anti-robot
   Cloudflare); il database dà eventi e iscritti solo a chi ha il ruolo
   interno (sono_interno(), RLS in 53-eventi-iscrizioni.sql) e lascia cambiare
   solo «presente». Ogni testo che arriva dal database passa da esc().
   Il banco di prova (Eventi/collaudo-gestione/) mette un finto Supabase in
   window.FINTO_SUPABASE prima di questo file.
   ========================================================================== */
'use strict';

(() => {
  if (window.top !== window.self) { document.body.textContent = ''; return; }

  const SUPABASE = {
    url: 'https://gmhmxybqmkcmnbjdnslz.supabase.co',
    chiave: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtaG14eWJxbWtjbW5iamRuc2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2NjM4OTgsImV4cCI6MjEwODIzOTg5OH0.af0OZrnCjJ6Wznmv0vmimnUSOPeLcrRSU5AhyvIRNBc'
  };
  const sb = window.FINTO_SUPABASE || window.supabase.createClient(SUPABASE.url, SUPABASE.chiave, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'eventi-gestione' }
  });

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const RUOLI = { allevatore: 'Allevatori', collaboratore: 'Collaboratori', veterinario: 'Veterinari', tecnico: 'Tecnici', studente: 'Studenti', altro: 'Altro' };
  const RUOLO1 = { allevatore: 'allevatore', collaboratore: 'collaboratore', veterinario: 'veterinario', tecnico: 'tecnico', studente: 'studente', altro: 'altro' };
  const ROMA = { timeZone: 'Europe/Rome' };

  let eventi = [], iscrizioni = [];
  let scelto = null;                 // codice dell'evento che si guarda
  let cerca = '', filtro = 'tutti', ordine = 'arrivo';
  let caricamento = null;

  /* ---------- avvisi brevi ---------- */
  let tAvviso = null;
  function avviso(testo, errore) {
    const a = $('avviso');
    a.textContent = testo; a.classList.toggle('errore', !!errore); a.classList.add('su');
    clearTimeout(tAvviso); tAvviso = setTimeout(() => a.classList.remove('su'), errore ? 6000 : 2600);
  }

  /* ---------- accesso ---------- */
  function mostra(cosa) {
    $('carico').hidden = cosa !== 'carico';
    $('accesso').hidden = cosa !== 'accesso';
    $('cruscotto').hidden = cosa !== 'cruscotto';
    $('azioni').hidden = cosa !== 'cruscotto';
  }

  function messaggioAccesso(t) { $('messaggio-accesso').textContent = t || ''; }

  $('modulo-accesso').addEventListener('submit', ev => {
    ev.preventDefault();
    const email = $('email').value.trim(), password = $('password').value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return messaggioAccesso('Scrivi un’e-mail valida.');
    if (!password) return messaggioAccesso('Scrivi la password.');
    const b = $('entra'); b.disabled = true; b.textContent = 'Entro…'; messaggioAccesso('');
    Antirobot.token()
      .then(captchaToken => sb.auth.signInWithPassword({ email, password, options: { captchaToken } }))
      .then(({ error }) => {
        if (error) {
          if (Antirobot.errore(error)) throw new Error('Il controllo di sicurezza non è passato: riprova tra un momento.');
          if (/invalid login/i.test(error.message)) throw new Error('E-mail o password sbagliate.');
          throw new Error(error.message);
        }
        $('password').value = '';
        return avvia();
      })
      .catch(e => messaggioAccesso(e.message || 'Non riesco a entrare: controlla la rete e riprova.'))
      .finally(() => { b.disabled = false; b.textContent = 'Entra'; });
  });

  $('esci').addEventListener('click', () => {
    sb.auth.signOut().finally(() => { eventi = []; iscrizioni = []; mostra('accesso'); });
  });

  $('aggiorna').addEventListener('click', () => carica(true));

  /* ---------- dati ---------- */
  function carica(aMano) {
    if (caricamento) return caricamento;
    const b = $('aggiorna'); b.disabled = true;
    caricamento = Promise.all([
      sb.from('eventi').select('*').order('quando'),
      sb.from('eventi_iscrizioni').select('*').order('creato_il')
    ]).then(([e, i]) => {
      const err = e.error || i.error;
      if (err) throw new Error(err.message);
      eventi = e.data || []; iscrizioni = i.data || [];
      if (!scelto || !eventi.some(x => x.codice === scelto)) scelto = eventoDiPartenza();
      disegna();
      if (aMano) avviso('Aggiornato');
    }).catch(e => avviso('Non aggiornato: ' + (e.message || 'rete assente'), true))
      .finally(() => { caricamento = null; b.disabled = false; });
    return caricamento;
  }

  // si apre sul prossimo evento (o su quello di oggi); se sono tutti passati, sull'ultimo
  function eventoDiPartenza() {
    // #codice nell'indirizzo apre quell'evento (per esempio #mammella-2026-12-04)
    const voluto = decodeURIComponent(location.hash.slice(1));
    if (voluto && eventi.some(x => x.codice === voluto)) return voluto;
    const ora = Date.now();
    const prossimo = eventi.find(x => new Date(x.quando).getTime() > ora - 18 * 36e5);
    return prossimo ? prossimo.codice : (eventi.length ? eventi[eventi.length - 1].codice : null);
  }

  function avvia() {
    mostra('carico');
    return sb.rpc('sono_interno').then(({ data, error }) => {
      if (error) throw new Error(error.message);
      if (!data) {
        mostra('accesso');
        messaggioAccesso('Questo account non vede gli iscritti: serve l’account di Pro Farmer.');
        return sb.auth.signOut();
      }
      mostra('cruscotto');
      return carica();
    }).catch(e => { mostra('accesso'); messaggioAccesso(e.message); });
  }

  /* ---------- disegno ---------- */
  const giorno = d => new Date(d).toLocaleDateString('it-IT', { ...ROMA, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const breve = d => new Date(d).toLocaleDateString('it-IT', { ...ROMA, day: 'numeric', month: 'short' });
  const ora = d => new Date(d).toLocaleTimeString('it-IT', { ...ROMA, hour: '2-digit', minute: '2-digit' });
  const quandoIscritto = d => new Date(d).toLocaleString('it-IT', { ...ROMA, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  const titoloBreve = e => String(e.titolo || e.codice).split(' · ').pop();
  const passato = e => new Date(e.quando).getTime() < Date.now() - 18 * 36e5;

  function disegna() {
    disegnaScelta();
    const e = eventi.find(x => x.codice === scelto);
    if (!e) {
      $('evento').innerHTML = '<div class="vuoto"><h1>Nessun evento</h1><p>Quando c’è un evento nuovo nel database, compare qui con i suoi iscritti.</p></div>';
      return;
    }
    $('evento').innerHTML = testaEvento(e) + '<div id="elenco-box"></div>';
    disegnaElenco();
  }

  function disegnaScelta() {
    const nav = $('scelta-eventi');
    if (eventi.length < 2) { nav.hidden = true; nav.innerHTML = ''; return; }
    nav.hidden = false;
    const prossimi = eventi.filter(x => !passato(x)), vecchi = eventi.filter(passato).reverse();
    const pulsante = x => `<button type="button" class="scheda-evento${x.codice === scelto ? ' attiva' : ''}${passato(x) ? ' passato' : ''}" data-evento="${esc(x.codice)}" aria-pressed="${x.codice === scelto}">`
      + `<span class="data">${esc(breve(x.quando))}</span><span class="nome">${esc(titoloBreve(x))}</span></button>`;
    nav.innerHTML = prossimi.map(pulsante).join('') + (vecchi.length ? '<span class="separa">Passati</span>' + vecchi.map(pulsante).join('') : '');
    // l'evento scelto resta a vista anche sul telefono, dove la fila scorre di lato
    const att = nav.querySelector('.attiva');
    if (att) nav.scrollLeft = Math.max(0, att.offsetLeft - nav.offsetLeft - 16);
  }

  function numeri(e) {
    const r = iscrizioni.filter(x => x.evento === e.codice);
    const dentro = r.filter(x => !x.lista_attesa), attesa = r.filter(x => x.lista_attesa);
    return {
      r, dentro, attesa,
      pranzo: dentro.filter(x => x.pranzo).length,
      visita: dentro.filter(x => x.visita === 'si').length,
      forse: dentro.filter(x => x.visita === 'forse').length,
      presenti: dentro.filter(x => x.presente).length,
      altri: dentro.reduce((t, x) => t + (Number(x.altri) || 0), 0),
      altriPiu: dentro.some(x => Number(x.altri) === 3),
      novita: r.filter(x => x.consenso_novita).length,
      allergie: dentro.filter(x => x.pranzo && x.allergie).length
    };
  }

  function testaEvento(e) {
    const n = numeri(e);
    const liberi = e.posti != null ? Math.max(0, e.posti - n.dentro.length) : null;
    const chiuso = e.chiude_il && new Date(e.chiude_il).getTime() < Date.now();
    const oggi = new Date(e.quando).toLocaleDateString('it-IT', ROMA) === new Date().toLocaleDateString('it-IT', ROMA);
    const cartella = String(e.codice).split('-')[0];
    const tile = (cifra, etichetta, sotto, cls) => `<div class="numero${cls ? ' ' + cls : ''}"><span class="cifra">${cifra}</span><span class="etichetta">${etichetta}</span>${sotto ? `<span class="sotto">${sotto}</span>` : ''}</div>`;

    let h = '<section class="evento-testa">'
      + `<p class="quando-evento">${oggi ? '<span class="oggi">Oggi</span> ' : ''}${esc(giorno(e.quando))} · ore ${esc(ora(e.quando))}</p>`
      + `<h1>${esc(titoloBreve(e))}</h1>`
      + (String(e.titolo).includes(' · ') ? `<p class="sottotitolo">${esc(String(e.titolo).split(' · ')[0])}</p>` : '')
      + '<p class="stato-iscrizioni">'
      + (chiuso ? 'Iscrizioni chiuse' : e.chiude_il ? `Iscrizioni aperte fino al ${esc(breve(e.chiude_il))} alle ${esc(ora(e.chiude_il))}` : 'Iscrizioni aperte')
      + ` · <a href="../${esc(cartella)}/" target="_blank" rel="noopener">pagina di iscrizione</a></p>`
      + '</section>';

    h += '<section class="numeri" aria-label="I numeri">'
      + tile(n.dentro.length + (e.posti != null ? `<small> / ${e.posti}</small>` : ''), 'Iscritti',
          liberi != null ? (liberi ? `restano ${liberi} ${liberi === 1 ? 'posto' : 'posti'}` : 'posti esauriti') : 'senza limite di posti', 'principale')
      + tile(n.attesa.length, 'Lista d’attesa', n.attesa.length ? 'oltre i posti' : 'nessuno', n.attesa.length ? 'attenzione' : '')
      + tile(n.pranzo, 'A pranzo', n.allergie ? `${n.allergie} con allergie o intolleranze` : 'nessuna allergia segnalata')
      + tile(n.visita, 'In visita', n.forse ? `+ ${n.forse} forse` : '')
      + tile(n.altri + (n.altriPiu ? '+' : ''), 'Altri dell’azienda', 'annunciati da chi si è iscritto')
      + tile(n.presenti + `<small> / ${n.dentro.length}</small>`, 'Presenti', n.presenti ? 'per gli attestati' : 'da segnare il giorno dell’evento', 'presenti')
      + '</section>';

    // chi viene: i ruoli in una barra
    if (n.dentro.length) {
      const conta = Object.keys(RUOLI).map(k => [k, n.dentro.filter(x => x.ruolo === k).length]).filter(x => x[1]);
      h += '<section class="ruoli" aria-label="Chi viene"><div class="barra">'
        + conta.map(([k, c]) => `<span class="pezzo r-${k}" style="flex:${c}" title="${RUOLI[k]}: ${c}"></span>`).join('') + '</div>'
        + '<ul class="legenda">' + conta.map(([k, c]) => `<li><i class="r-${k}"></i>${RUOLI[k]} <b>${c}</b></li>`).join('')
        + `<li class="novita">Ok alle novità <b>${n.novita}</b></li></ul></section>`;
    }

    h += '<section class="attrezzi">'
      + `<input type="search" id="cerca" placeholder="Cerca nome, azienda, comune, telefono…" value="${esc(cerca)}" aria-label="Cerca tra gli iscritti" autocomplete="off">`
      + '<div class="filtri" role="group" aria-label="Filtra">'
      + [['tutti', 'Tutti', n.r.length], ['pranzo', 'A pranzo', n.pranzo], ['visita', 'In visita', n.visita + n.forse], ['attesa', 'Lista d’attesa', n.attesa.length],
         ['presenti', 'Presenti', n.presenti], ['mancano', 'Non ancora arrivati', n.dentro.length - n.presenti]]
        .filter(([k, , c]) => k === 'tutti' || c || filtro === k)
        .map(([k, t, c]) => `<button type="button" class="filtro${filtro === k ? ' attivo' : ''}" data-filtro="${k}" aria-pressed="${filtro === k}">${t} <b>${c}</b></button>`).join('')
      + '</div>'
      + '<div class="attrezzi-fondo">'
      + `<label class="ordina">Ordina <select id="ordine"><option value="arrivo"${ordine === 'arrivo' ? ' selected' : ''}>per iscrizione</option><option value="nome"${ordine === 'nome' ? ' selected' : ''}>per nome</option><option value="azienda"${ordine === 'azienda' ? ' selected' : ''}>per azienda</option></select></label>`
      + `<button type="button" class="bottone bottone-chiaro" id="excel" data-evento="${esc(e.codice)}"${n.r.length ? '' : ' disabled'}>Scarica l’elenco (Excel)</button>`
      + '</div></section>';
    return h;
  }

  function scelti() {
    const q = cerca.trim().toLowerCase();
    let r = iscrizioni.filter(x => x.evento === scelto);
    if (filtro === 'pranzo') r = r.filter(x => !x.lista_attesa && x.pranzo);
    if (filtro === 'visita') r = r.filter(x => !x.lista_attesa && x.visita !== 'no');
    if (filtro === 'attesa') r = r.filter(x => x.lista_attesa);
    if (filtro === 'presenti') r = r.filter(x => !x.lista_attesa && x.presente);
    if (filtro === 'mancano') r = r.filter(x => !x.lista_attesa && !x.presente);
    if (q) r = r.filter(x => [x.nome, x.azienda, x.comune, x.telefono, x.email, x.ruolo_altro, x.allergie].join(' ').toLowerCase().includes(q));
    const per = k => (a, b) => String(a[k] || '').localeCompare(String(b[k] || ''), 'it', { sensitivity: 'base' });
    if (ordine === 'nome') r = r.slice().sort(per('nome'));
    else if (ordine === 'azienda') r = r.slice().sort((a, b) => per('azienda')(a, b) || per('nome')(a, b));
    // la lista d'attesa sempre in fondo, nell'ordine di arrivo
    return r.filter(x => !x.lista_attesa).concat(r.filter(x => x.lista_attesa));
  }

  function disegnaElenco() {
    const box = $('elenco-box');
    if (!box) return;
    const tutti = iscrizioni.filter(x => x.evento === scelto);
    const r = scelti();
    if (!tutti.length) { box.innerHTML = '<div class="vuoto"><p>Ancora nessun iscritto.</p></div>'; return; }
    if (!r.length) { box.innerHTML = '<div class="vuoto"><p>Nessun iscritto corrisponde alla ricerca.</p></div>'; return; }
    let numero = 0;
    box.innerHTML = `<p class="quanti">${r.length} ${r.length === 1 ? 'persona' : 'persone'}</p><ol class="elenco">` + r.map(x => {
      if (!x.lista_attesa) numero++;
      const tel = String(x.telefono || '').replace(/[^\d+]/g, '');
      const ruolo = (RUOLO1[x.ruolo] || x.ruolo) + (x.ruolo_altro ? ': ' + x.ruolo_altro : '');
      const etichette = [
        x.pranzo ? '<span class="et si">Pranzo</span>' : '<span class="et no">Senza pranzo</span>',
        x.visita === 'si' ? '<span class="et si">Visita</span>' : x.visita === 'forse' ? '<span class="et forse">Visita forse</span>' : '<span class="et no">Senza visita</span>',
        x.altri ? `<span class="et">+${Number(x.altri) === 3 ? '3 o più' : Number(x.altri)} dell’azienda</span>` : '',
        x.vacche != null ? `<span class="et">${esc(Number(x.vacche).toLocaleString('it-IT'))} vacche</span>` : '',
        x.consenso_novita ? '<span class="et tenue">ok novità</span>' : ''
      ].join('');
      return `<li class="iscritto${x.lista_attesa ? ' in-attesa' : ''}${x.presente ? ' e-presente' : ''}">`
        + `<div class="iscritto-testa"><span class="num">${x.lista_attesa ? '—' : numero}</span>`
        + `<div class="chi"><strong>${esc(x.nome)}</strong><span>${esc(x.azienda)}${x.comune ? ' · ' + esc(x.comune) : ''}</span></div>`
        + (x.lista_attesa ? '<span class="stato-attesa">Lista d’attesa</span>'
          : `<button type="button" class="presente${x.presente ? ' si' : ''}" data-presente="${esc(x.id)}" aria-pressed="${!!x.presente}">${x.presente ? '✓ Presente' : 'Segna presente'}</button>`)
        + '</div>'
        + `<div class="dettagli"><span class="ruolo">${esc(ruolo)}</span>`
        + (tel ? `<a href="tel:${esc(tel)}">${esc(x.telefono)}</a>` : '')
        + (x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : '')
        + `<span class="tenue">iscritto il ${esc(quandoIscritto(x.creato_il))}</span></div>`
        + `<div class="etichette">${etichette}</div>`
        + (x.allergie ? `<p class="allergie"><b>Allergie o intolleranze:</b> ${esc(x.allergie)}</p>` : '')
        + '</li>';
    }).join('') + '</ol>';
  }

  /* ---------- tocchi ---------- */
  document.addEventListener('click', ev => {
    const s = ev.target.closest('[data-evento].scheda-evento');
    if (s) { scelto = s.dataset.evento; history.replaceState(null, '', '#' + encodeURIComponent(scelto)); filtro = 'tutti'; cerca = ''; disegna(); window.scrollTo({ top: 0 }); return; }
    const f = ev.target.closest('[data-filtro]');
    if (f) {
      filtro = f.dataset.filtro;
      document.querySelectorAll('[data-filtro]').forEach(b => { const on = b.dataset.filtro === filtro; b.classList.toggle('attivo', on); b.setAttribute('aria-pressed', on); });
      disegnaElenco(); return;
    }
    const p = ev.target.closest('[data-presente]');
    if (p) return segnaPresente(p);
    if (ev.target.closest('#excel')) return scaricaExcel();
  });
  document.addEventListener('input', ev => {
    if (ev.target.id === 'cerca') { cerca = ev.target.value; disegnaElenco(); }
  });
  document.addEventListener('change', ev => {
    if (ev.target.id === 'ordine') { ordine = ev.target.value; disegnaElenco(); }
  });

  function segnaPresente(b) {
    const x = iscrizioni.find(i => i.id === b.dataset.presente);
    if (!x) return;
    const nuovo = !x.presente;
    b.disabled = true;
    sb.from('eventi_iscrizioni').update({ presente: nuovo }).eq('id', x.id).select('id, presente').then(({ data, error }) => {
      b.disabled = false;
      if (error) return avviso('Non salvato: ' + error.message, true);
      if (!data || !data.length) return avviso('Non salvato: il database non ha cambiato niente. Esci e rientra.', true);
      x.presente = nuovo;
      const e = eventi.find(y => y.codice === scelto);
      // ridisegno i numeri tenendo la ricerca e la posizione nella pagina
      const y = window.scrollY;
      $('evento').innerHTML = testaEvento(e) + '<div id="elenco-box"></div>';
      disegnaElenco();
      window.scrollTo({ top: y });
      avviso(nuovo ? `${x.nome}: presente` : `${x.nome}: tolto dai presenti`);
    });
  }

  // CSV con il separatore «;» e il BOM: Excel in italiano lo apre già in colonne
  function scaricaExcel() {
    const e = eventi.find(y => y.codice === scelto);
    const r = iscrizioni.filter(i => i.evento === scelto);
    const col = [['nome', 'Nome'], ['azienda', 'Azienda'], ['comune', 'Comune'], ['ruolo', 'Ruolo'], ['telefono', 'Telefono'], ['email', 'E-mail'],
      ['vacche', 'Vacche in lattazione'], ['pranzo', 'Pranzo'], ['allergie', 'Allergie'], ['visita', 'Visita'], ['altri', 'Altri dell’azienda'],
      ['lista_attesa', 'Lista d’attesa'], ['presente', 'Presente'], ['consenso_novita', 'Ok alle novità'], ['creato_il', 'Iscritto il']];
    const val = (i, k) => {
      if (k === 'ruolo') return i.ruolo + (i.ruolo_altro ? ': ' + i.ruolo_altro : '');
      if (k === 'visita') return i.visita === 'si' ? 'sì' : i.visita;
      if (k === 'altri') return i.altri === 3 ? '3 o più' : i.altri;
      if (k === 'creato_il') return new Date(i.creato_il).toLocaleString('it-IT', { ...ROMA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      return i[k];
    };
    // un testo che inizia con = + - @ Excel lo prenderebbe per una formula (anche il telefono «+39…»):
    // davanti va una tabulazione, che non si vede e lo lascia testo
    const cella = v => {
      let t = String(v == null ? '' : v === true ? 'sì' : v === false ? 'no' : v);
      if (/^[=+\-@]/.test(t)) t = '\t' + t;
      return '"' + t.replace(/"/g, '""') + '"';
    };
    const testo = '﻿' + col.map(c => cella(c[1])).join(';') + '\r\n' + r.map(i => col.map(c => cella(val(i, c[0]))).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([testo], { type: 'text/csv;charset=utf-8' }));
    a.download = 'iscritti-' + (e ? e.codice : 'evento') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // tornando sulla pagina (per esempio dal telefono in tasca) i dati si rinfrescano
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !$('cruscotto').hidden) carica();
  });

  /* ---------- partenza ---------- */
  sb.auth.getSession().then(({ data }) => {
    if (data && data.session) return avvia();
    mostra('accesso');
  }).catch(() => mostra('accesso'));
})();
