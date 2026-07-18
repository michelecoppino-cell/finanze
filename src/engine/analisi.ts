// Motore di analisi spese/entrate. Replica la logica del foglio "AnalisiSpese":
// somma le uscite per categoria e per mese (equivalente ai SUMIFS dell'Excel).

import { Transazione } from "../types";
import { annoMese } from "../util";

export interface RigaMese {
  mese: string; // yyyy-mm
  perCategoria: Record<string, number>; // uscite per categoria
  totaleUscite: number;
  totaleEntrate: number;
  tasse: number; // uscite con flag tasse
  trasferimenti: number; // uscite con flag trasferimento (giroconti/investimenti)
}

export interface AnalisiRisultato {
  mesi: RigaMese[];
  categorie: string[];
  totalePerCategoria: Record<string, number>;
  totaleUscite: number;
  totaleEntrate: number;
  totaleTasse: number;
  totaleTrasferimenti: number;
}

const SENZA_CATEGORIA = "(non categorizzato)";

/** Ordina gli yyyy-mm crescenti e riempie i buchi tra il primo e l'ultimo. */
function tuttiIMesi(daISO: string, aISO: string): string[] {
  const [ya, ma] = daISO.split("-").map(Number);
  const [yb, mb] = aISO.split("-").map(Number);
  const out: string[] = [];
  let y = ya;
  let m = ma;
  while (y < yb || (y === yb && m <= mb)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function analizza(
  transazioni: Transazione[],
  categorieNote: string[],
): AnalisiRisultato {
  if (transazioni.length === 0) {
    return {
      mesi: [],
      categorie: categorieNote,
      totalePerCategoria: {},
      totaleUscite: 0,
      totaleEntrate: 0,
      totaleTasse: 0,
      totaleTrasferimenti: 0,
    };
  }

  const perMese = new Map<string, RigaMese>();
  const totalePerCategoria: Record<string, number> = {};
  let totaleUscite = 0;
  let totaleEntrate = 0;
  let totaleTasse = 0;
  let totaleTrasferimenti = 0;
  const categorieUsate = new Set<string>(categorieNote);

  let minMese: string | undefined;
  let maxMese: string | undefined;

  for (const t of transazioni) {
    const mese = annoMese(t.data);
    if (!minMese || mese < minMese) minMese = mese;
    if (!maxMese || mese > maxMese) maxMese = mese;

    let riga = perMese.get(mese);
    if (!riga) {
      riga = {
        mese,
        perCategoria: {},
        totaleUscite: 0,
        totaleEntrate: 0,
        tasse: 0,
        trasferimenti: 0,
      };
      perMese.set(mese, riga);
    }

    // I trasferimenti (giroconti/PAC) non sono spese: non entrano nelle
    // categorie ne' nel totale uscite, ma vengono tracciati a parte.
    if (t.trasferimento) {
      if (t.uscite) {
        riga.trasferimenti += t.uscite;
        totaleTrasferimenti += t.uscite;
      }
      continue;
    }

    const cat = t.categoria?.trim() || SENZA_CATEGORIA;
    categorieUsate.add(cat);

    if (t.uscite) {
      riga.perCategoria[cat] = (riga.perCategoria[cat] ?? 0) + t.uscite;
      riga.totaleUscite += t.uscite;
      totalePerCategoria[cat] = (totalePerCategoria[cat] ?? 0) + t.uscite;
      totaleUscite += t.uscite;
      if (t.tasse) {
        riga.tasse += t.uscite;
        totaleTasse += t.uscite;
      }
    }
    if (t.entrate) {
      riga.totaleEntrate += t.entrate;
      totaleEntrate += t.entrate;
    }
  }

  const mesiOrdinati = tuttiIMesi(minMese!, maxMese!).map(
    (m) =>
      perMese.get(m) ?? {
        mese: m,
        perCategoria: {},
        totaleUscite: 0,
        totaleEntrate: 0,
        tasse: 0,
        trasferimenti: 0,
      },
  );

  const categorie = [...categorieUsate].sort((a, b) => {
    // categorie note per prime nell'ordine dato, poi le altre
    const ia = categorieNote.indexOf(a);
    const ib = categorieNote.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });

  return {
    mesi: mesiOrdinati,
    categorie,
    totalePerCategoria,
    totaleUscite,
    totaleEntrate,
    totaleTasse,
    totaleTrasferimenti,
  };
}

/** Aggrega le righe mensili per anno. */
export function perAnno(mesi: RigaMese[]): RigaMese[] {
  const map = new Map<string, RigaMese>();
  for (const r of mesi) {
    const anno = r.mese.slice(0, 4);
    let a = map.get(anno);
    if (!a) {
      a = {
        mese: anno,
        perCategoria: {},
        totaleUscite: 0,
        totaleEntrate: 0,
        tasse: 0,
        trasferimenti: 0,
      };
      map.set(anno, a);
    }
    for (const [cat, v] of Object.entries(r.perCategoria)) {
      a.perCategoria[cat] = (a.perCategoria[cat] ?? 0) + v;
    }
    a.totaleUscite += r.totaleUscite;
    a.totaleEntrate += r.totaleEntrate;
    a.tasse += r.tasse;
    a.trasferimenti += r.trasferimenti;
  }
  return [...map.values()].sort((x, y) => x.mese.localeCompare(y.mese));
}
