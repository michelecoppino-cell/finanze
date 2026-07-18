# Finanze

Strumento personale di contabilità, saldo reale e proiezione futura. Web app
statica: **i dati restano solo nel tuo browser** (IndexedDB), con backup e
spostamento tra dispositivi tramite export/import di un file JSON.

Nasce come versione più snella di un foglio Excel personale, con la stessa
logica (analisi spese, saldo con ridistribuzione tasse forfettario/Inarcassa,
proiezione investimenti in termini reali) ma senza le formule fragili.

## Sviluppo

```bash
npm install
npm run dev      # server di sviluppo su http://localhost:5173
npm run build    # build di produzione in dist/
npm run preview  # anteprima della build
```

## Deploy su Cloudflare Pages

1. Vai su Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** e seleziona questa repository.
2. Impostazioni di build:
   - **Framework preset**: Vite (oppure "None")
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Deploy. Ad ogni push sul branch, Cloudflare ricompila e pubblica.

Nessun backend, nessuna variabile d'ambiente, nessun costo: è tutto statico.

## Come caricare i dati

I dati vivono solo nel tuo browser. Ci sono due modi per farli entrare:

### 1. Importare un backup JSON (consigliato per iniziare)

Un file `.json` contiene **tutto**: movimenti già categorizzati, tasse,
parametri. È anche il formato di backup/spostamento tra dispositivi.

1. Apri l'app (la tua URL Cloudflare, oppure `npm run dev` in locale).
2. Vai su **Impostazioni → Importa JSON**.
3. Seleziona il file `.json`. Fatto: movimenti, analisi, saldo e tasse si
   popolano subito.

Per fare un backup: **Impostazioni → Esporta JSON** (salvalo dove vuoi, es. una
cartella OneDrive). Per spostare i dati su un altro dispositivo: esporta di là,
importa di qua.

### 2. Importare i movimenti da CSV (aggiornamenti dal conto)

Per aggiungere nuovi movimenti dal tuo conto:

1. Dalla tua banca, esporta i movimenti in **CSV** (qualsiasi export va bene).
2. Nell'app: **Movimenti → Importa CSV** e seleziona il file.
3. L'app prova a indovinare le colonne (data, entrate, uscite, causale);
   controlla la mappatura nell'anteprima e conferma. Gestisce separatore `;`
   o `,` e i formati italiani (`1.234,56`, `gg/mm/aaaa`).
4. I nuovi movimenti si aggiungono a quelli esistenti. Categorizzali a mano
   o col bottone **Categorizza con Claude**.

## Flusso di lavoro (git)

Per impostazione predefinita ogni modifica viene sviluppata su un branch e poi
**aperta come Pull Request e mergiata su `main`**. Cloudflare Pages ricompila e
pubblica `main` a ogni merge.

## Struttura

```
src/
  types.ts            modello dati (rispecchia i fogli dell'Excel)
  util.ts             parsing date/numeri (anche formato IT), formattazione €
  crypto.ts           hash password del gate
  store/
    db.ts             persistenza IndexedDB
    io.ts             export/import JSON, parser CSV movimenti
    AppStore.tsx      stato globale React
  engine/
    analisi.ts        analisi spese per categoria/mese/anno (logica SUMIFS)
  auth/Gate.tsx       barriera con codice di accesso
  engine/
    saldo.ts          saldo giornaliero: grezzo, netto tasse, potere d'acquisto
  pages/
    Movimenti.tsx     import CSV, tabella, categorie, prompt Claude
    AnalisiSpese.tsx  tabella + grafico spese
    Saldo.tsx         saldo reale (grafico a linee)
    Tasse.tsx         dati fiscali per anno (editabili)
    Proiezione.tsx    (Fasi 4-5) proiezione futura
    Impostazioni.tsx  parametri, categorie, password, backup
```

## Roadmap

- [x] **Fase 1-2** — Scaffold, storage, import CSV, movimenti, analisi spese.
- [x] **Fase 3** — Saldo reale (grezzo → netto tasse → potere d'acquisto),
      modulo Tasse.
- [ ] **Fase 4-5** — Proiezione futura, investimenti, dashboard pensione.
- [ ] **OneDrive** — login Microsoft + sync automatica (opzionale, gratuito,
      client-side via MSAL).

## Privacy

I dati finanziari non lasciano mai il browser. Il file Excel di partenza e i
backup JSON sono esclusi da git (`.gitignore`).
