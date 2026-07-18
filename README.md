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
  pages/
    Movimenti.tsx     import CSV, tabella, categorie, prompt Claude
    AnalisiSpese.tsx  tabella + grafico spese
    Saldo.tsx         (Fase 3) saldo reale
    Proiezione.tsx    (Fasi 4-5) proiezione futura
    Impostazioni.tsx  parametri, categorie, password, backup
```

## Roadmap

- [x] **Fase 1-2** — Scaffold, storage, import CSV, movimenti, analisi spese.
- [ ] **Fase 3** — Saldo reale (grezzo → riadattamento tasse → mensilizzazione
      fatture), moduli Tasse e Fatture.
- [ ] **Fase 4-5** — Proiezione futura, investimenti, dashboard pensione.
- [ ] **OneDrive** — login Microsoft + sync automatica (opzionale, gratuito,
      client-side via MSAL).

## Privacy

I dati finanziari non lasciano mai il browser. Il file Excel di partenza e i
backup JSON sono esclusi da git (`.gitignore`).
