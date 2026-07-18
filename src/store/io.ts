// Import/export: JSON dell'app (backup completo) e CSV dei movimenti bancari.

import { DatiApp, Transazione, VERSIONE_DATI, datiVuoti } from "../types";
import { parseDataIso, parseNumeroIt, uid } from "../util";

// ---------- Export / Import JSON (backup completo) ----------

export function esportaJson(dati: DatiApp): void {
  const blob = new Blob([JSON.stringify(dati, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const oggi = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `finanze-${oggi}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importaJson(testo: string): DatiApp {
  const raw = JSON.parse(testo);
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.transazioni)) {
    throw new Error("File non valido: manca l'elenco transazioni.");
  }
  // Merge con struttura vuota per tollerare versioni diverse / campi mancanti.
  const base = datiVuoti();
  return {
    ...base,
    ...raw,
    versione: VERSIONE_DATI,
    parametri: { ...base.parametri, ...(raw.parametri ?? {}) },
  };
}

// ---------- Parser CSV ----------

/** Rileva il separatore piu' probabile guardando la prima riga. */
function rilevaSeparatore(riga: string): string {
  const candidati = [";", ",", "\t"];
  let migliore = ";";
  let max = -1;
  for (const c of candidati) {
    const n = riga.split(c).length;
    if (n > max) {
      max = n;
      migliore = c;
    }
  }
  return migliore;
}

/** Parser CSV che gestisce campi tra virgolette e separatore configurabile. */
export function parseCsv(testo: string): string[][] {
  const t = testo.replace(/^﻿/, ""); // rimuove BOM
  const primaRiga = t.split(/\r?\n/)[0] ?? "";
  const sep = rilevaSeparatore(primaRiga);

  const righe: string[][] = [];
  let campo = "";
  let riga: string[] = [];
  let inVirgolette = false;

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inVirgolette) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          inVirgolette = false;
        }
      } else {
        campo += ch;
      }
    } else if (ch === '"') {
      inVirgolette = true;
    } else if (ch === sep) {
      riga.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      riga.push(campo);
      campo = "";
      if (riga.some((c) => c.trim() !== "")) righe.push(riga);
      riga = [];
    } else {
      campo += ch;
    }
  }
  if (campo !== "" || riga.length > 0) {
    riga.push(campo);
    if (riga.some((c) => c.trim() !== "")) righe.push(riga);
  }
  return righe;
}

export type MappaturaCsv = {
  data: number;
  entrate: number;
  uscite: number;
  tipologia?: number;
  causale?: number;
  stato?: number;
  /** Colonna unica importo con segno (alternativa a entrate/uscite). */
  importo?: number;
};

/** Prova a indovinare la mappatura colonne dagli header. */
export function indovinaMappatura(header: string[]): MappaturaCsv {
  const norm = header.map((h) => h.toLowerCase().trim());
  const trova = (...chiavi: string[]) =>
    norm.findIndex((h) => chiavi.some((k) => h.includes(k)));

  const data = trova("data operazione", "data valuta", "data contabile", "data");
  const entrate = trova("entrate", "accrediti", "avere", "entrata");
  const uscite = trova("uscite", "addebiti", "dare", "uscita");
  const importo = trova("importo", "amount");
  const tipologia = trova("tipologia", "tipo", "operazione");
  const causale = trova("causale", "descrizione", "dettagli", "description");
  const stato = trova("stato", "status");

  return {
    data: data < 0 ? 0 : data,
    entrate,
    uscite,
    importo: entrate < 0 && uscite < 0 ? importo : -1,
    tipologia: tipologia < 0 ? undefined : tipologia,
    causale: causale < 0 ? undefined : causale,
    stato: stato < 0 ? undefined : stato,
  };
}

/** Converte le righe CSV (senza header) in transazioni secondo la mappatura. */
export function righeATransazioni(
  righe: string[][],
  m: MappaturaCsv,
): Transazione[] {
  const out: Transazione[] = [];
  for (const r of righe) {
    const data = parseDataIso(r[m.data]);
    if (!data) continue;

    let entrate = m.entrate >= 0 ? parseNumeroIt(r[m.entrate]) : undefined;
    let uscite = m.uscite >= 0 ? parseNumeroIt(r[m.uscite]) : undefined;

    if (m.importo !== undefined && m.importo >= 0) {
      const imp = parseNumeroIt(r[m.importo]);
      if (imp !== undefined) {
        if (imp >= 0) entrate = imp;
        else uscite = Math.abs(imp);
      }
    }
    // Le uscite sono sempre positive (come nell'Excel: colonna G).
    if (uscite !== undefined) uscite = Math.abs(uscite);
    if (entrate !== undefined) entrate = Math.abs(entrate);

    if (entrate === undefined && uscite === undefined) continue;

    out.push({
      id: uid(),
      data,
      tipologia: m.tipologia !== undefined ? r[m.tipologia]?.trim() : undefined,
      causale: m.causale !== undefined ? r[m.causale]?.trim() : undefined,
      stato: m.stato !== undefined ? r[m.stato]?.trim() : undefined,
      entrate,
      uscite,
    });
  }
  return out;
}
