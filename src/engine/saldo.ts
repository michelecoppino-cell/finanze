// Motore del saldo reale. Replica, in forma piu' pulita, la catena di
// correzione del foglio "Saldo" dell'Excel:
//
//   grezzo         = saldo iniziale + cumulato (entrate - uscite) dai movimenti
//   nettoTasse     = grezzo - tasse maturate giorno-per-giorno + tasse gia' pagate
//   potereAcquisto = nettoTasse - incassi fattura a blocco + incassi fattura spalmati sul mese
//
// La quota tasse annua (forfettario + Inarcassa) viene spalmata su base
// giornaliera: cosi' il saldo mostra i soldi davvero disponibili, come se le
// tasse fossero accantonate ogni giorno invece che pagate a scatti.

import { AnnoTasse, Parametri, Transazione } from "../types";

export interface PuntoSaldo {
  data: string; // ISO
  grezzo: number;
  nettoTasse: number;
  potereAcquisto: number;
}

export interface SaldoRisultato {
  punti: PuntoSaldo[];
  ultimo?: PuntoSaldo;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function isoDa(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function giornoDellAnno(d: Date): number {
  const inizio = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - inizio.getTime();
  return Math.floor(diff / 86400000);
}
function giorniNelMese(anno: number, mese1: number): number {
  return new Date(anno, mese1, 0).getDate();
}

/** Tasse totali dell'anno: importi reali se presenti, altrimenti stima da fatturato x aliquota. */
function tasseAnno(t: AnnoTasse): number {
  const somma = (t.inarcassa ?? 0) + (t.irpef ?? 0) + (t.aggiuntivi ?? 0);
  if (somma > 0) return somma;
  if (t.fatturato && t.tassazione) return t.fatturato * t.tassazione;
  return 0;
}

export function calcolaSaldo(
  transazioni: Transazione[],
  tasse: AnnoTasse[],
  par: Parametri,
): SaldoRisultato {
  if (transazioni.length === 0) return { punti: [] };

  const tassePerAnno = new Map<number, number>();
  for (const t of tasse) {
    if (t.anno) tassePerAnno.set(t.anno, tasseAnno(t));
  }

  const ordinate = [...transazioni].sort((a, b) => a.data.localeCompare(b.data));

  const netto = new Map<string, number>(); // entrate - uscite per giorno
  const tassePagate = new Map<string, number>(); // uscite flag tasse per giorno
  const fatturaGiorno = new Map<string, number>(); // entrate flag fattura per giorno
  const fatturaMese = new Map<string, number>(); // entrate flag fattura per mese yyyy-mm

  for (const t of ordinate) {
    const d = t.data;
    netto.set(d, (netto.get(d) ?? 0) + (t.entrate ?? 0) - (t.uscite ?? 0));
    if (t.tasse && t.uscite)
      tassePagate.set(d, (tassePagate.get(d) ?? 0) + t.uscite);
    if (t.fattura && t.entrate) {
      fatturaGiorno.set(d, (fatturaGiorno.get(d) ?? 0) + t.entrate);
      const m = d.slice(0, 7);
      fatturaMese.set(m, (fatturaMese.get(m) ?? 0) + t.entrate);
    }
  }

  const startIso =
    par.saldoInizialeData && par.saldoInizialeData < ordinate[0].data
      ? par.saldoInizialeData
      : ordinate[0].data;
  const endIso = ordinate[ordinate.length - 1].data;

  const start = new Date(startIso + "T00:00:00");
  const end = new Date(endIso + "T00:00:00");

  let cumNetto = par.saldoInizialeValore ?? 0;
  let cumTassePagate = 0;
  let cumFatturaBlocco = 0;
  let fatturaMesiCompletati = 0;
  let meseCorrente = "";

  const punti: PuntoSaldo[] = [];

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = isoDa(d);
    const mese = iso.slice(0, 7);

    cumNetto += netto.get(iso) ?? 0;
    cumTassePagate += tassePagate.get(iso) ?? 0;
    cumFatturaBlocco += fatturaGiorno.get(iso) ?? 0;

    if (meseCorrente && mese !== meseCorrente) {
      fatturaMesiCompletati += fatturaMese.get(meseCorrente) ?? 0;
    }
    meseCorrente = mese;

    // Tasse maturate: anni passati per intero, anno corrente pro-quota.
    let maturate = 0;
    const anno = d.getFullYear();
    for (const [ty, val] of tassePerAnno) {
      if (ty > anno) continue;
      if (ty < anno) maturate += val;
      else maturate += (val * giornoDellAnno(d)) / 365;
    }

    const grezzo = cumNetto;
    const nettoTasse = grezzo - maturate + cumTassePagate;

    const giorniMese = giorniNelMese(d.getFullYear(), d.getMonth() + 1);
    const fatturaSpalmata =
      fatturaMesiCompletati +
      ((fatturaMese.get(mese) ?? 0) * d.getDate()) / giorniMese;
    const potereAcquisto = nettoTasse - cumFatturaBlocco + fatturaSpalmata;

    punti.push({
      data: iso,
      grezzo: round(grezzo),
      nettoTasse: round(nettoTasse),
      potereAcquisto: round(potereAcquisto),
    });
  }

  return { punti, ultimo: punti[punti.length - 1] };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Riduce i punti per il grafico (uno ogni `passo` giorni, ultimo incluso). */
export function campiona(punti: PuntoSaldo[], passo = 7): PuntoSaldo[] {
  if (punti.length <= passo) return punti;
  const out: PuntoSaldo[] = [];
  for (let i = 0; i < punti.length; i += passo) out.push(punti[i]);
  const ultimo = punti[punti.length - 1];
  if (out[out.length - 1]?.data !== ultimo.data) out.push(ultimo);
  return out;
}
