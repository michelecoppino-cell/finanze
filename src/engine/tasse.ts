// Stima delle tasse maturate in un periodo, spalmando il totale annuo
// dichiarato (pannello "Tasse") giorno per giorno invece di usare i
// pagamenti reali: quelli sono spesso concentrati in poche rate irregolari
// e non riflettono quanto "costano" le tasse in un intervallo qualsiasi.

import { AnnoTasse } from "../types";

/** Totale tasse dichiarato per l'anno: importi reali se presenti, altrimenti stima da fatturato x aliquota. */
export function stimaAnnoTasse(t: AnnoTasse): number {
  const totale = (t.inarcassa ?? 0) + (t.irpef ?? 0) + (t.aggiuntivi ?? 0);
  if (totale > 0) return totale;
  if (t.fatturato && t.tassazione) return t.fatturato * t.tassazione;
  return 0;
}

function annoBisestile(anno: number): boolean {
  return (anno % 4 === 0 && anno % 100 !== 0) || anno % 400 === 0;
}

function giorniAnno(anno: number): number {
  return annoBisestile(anno) ? 366 : 365;
}

/** Numero del giorno nell'anno (1 = 1 gennaio) di una data ISO yyyy-mm-dd. */
function giornoDelAnno(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const inizio = new Date(y, 0, 1);
  const data = new Date(y, m - 1, d);
  return Math.floor((data.getTime() - inizio.getTime()) / 86400000) + 1;
}

/** Giorno precedente a una data ISO yyyy-mm-dd. */
function giornoPrima(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Tasse maturate stimate dall'inizio dei tempi fino al giorno incluso: gli
 * anni precedenti a quello del giorno contano per intero, quello del giorno
 * per la quota-parte dei giorni gia' trascorsi. Rispetta "escludiDalSaldo"
 * come il calcolo del saldo reale.
 */
function tasseMaturateAl(tasse: AnnoTasse[], iso: string): number {
  const anno = Number(iso.slice(0, 4));
  let tot = 0;
  for (const t of tasse) {
    if (!t.anno || t.escludiDalSaldo) continue;
    if (t.anno > anno) continue;
    const stima = stimaAnnoTasse(t);
    if (t.anno < anno) tot += stima;
    else tot += (stima * giornoDelAnno(iso)) / giorniAnno(t.anno);
  }
  return tot;
}

/** Tasse stimate maturate nell'intervallo [daISO, aISO] (entrambi inclusi). */
export function tasseStimatePeriodo(
  tasse: AnnoTasse[],
  daISO: string,
  aISO: string,
): number {
  return tasseMaturateAl(tasse, aISO) - tasseMaturateAl(tasse, giornoPrima(daISO));
}
