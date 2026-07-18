// Motore della proiezione futura. Continua la curva del saldo reale ("potere
// d'acquisto") verso il futuro usando gli scenari di entrate/uscite
// (SpeseEntrateFuturi) e la crescita degli investimenti (Investimenti), il
// tutto in termini REALI (al netto dell'inflazione).
//
// Il patrimonio e' scomposto in tre parti, cosi' il "liquido" e' davvero
// liquido (il capitale investito non ci finisce dentro):
//
//   liquido(t)   = ultimo saldo reale
//                  + risparmi mensili (netto - spesa)
//                  - spese grosse
//                  - versamenti negli investimenti (quando escono dal conto)
//                  + tranche che maturano (capitale + interessi tornano liquidi)
//   investito(t) = capitale attualmente vincolato negli investimenti attivi
//   guadagni(t)  = interessi COMPOSTI maturati (non ancora realizzati)
//   patrimonio   = liquido + investito + guadagni
//
// Assunzione: il capitale gia' investito prima dell'inizio della proiezione e'
// considerato fuori dal saldo liquido di partenza (i trasferimenti verso i
// depositi sono gia' usciti dal conto). I versamenti FUTURI, invece, vengono
// dedotti dal liquido quando avvengono.

import {
  AnnoTasse,
  EventoFuturo,
  Investimento,
  Parametri,
  Transazione,
} from "../types";
import { calcolaSaldo } from "./saldo";

export interface PuntoProiezione {
  data: string; // yyyy-mm-01
  eta: number;
  liquido: number;
  investito: number;
  guadagni: number;
  totale: number;
}

export interface ProiezioneRisultato {
  punti: PuntoProiezione[];
  patrimonioOggi?: number;
  capitalePensione?: number;
  dataPensione?: string;
  renditaAnnua?: number;
  renditaMensile?: number;
  /** Liquidita' minima raggiunta lungo la proiezione (se <0 lo scenario non si autofinanzia). */
  liquiditaMinima?: number;
}

const MS_ANNO = 365.25 * 86400000;

function anniTra(da: Date, a: Date): number {
  return (a.getTime() - da.getTime()) / MS_ANNO;
}
function inizioMese(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function chiaveMese(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface Contributo {
  data: Date;
  importo: number;
}

/** Elenco dei versamenti di una tranche: capitale iniziale + eventuali versamenti periodici. */
function contributiDi(inv: Investimento): Contributo[] {
  const inizio = new Date(inv.dataInizio + "T00:00:00");
  const fine = new Date(inv.dataFine + "T00:00:00");
  const out: Contributo[] = [{ data: inizio, importo: inv.capitale || 0 }];
  if (inv.versamentoPeriodico && inv.frequenzaMesi) {
    const d = new Date(inizio);
    d.setMonth(d.getMonth() + inv.frequenzaMesi);
    while (d < fine) {
      out.push({ data: new Date(d), importo: inv.versamentoPeriodico });
      d.setMonth(d.getMonth() + inv.frequenzaMesi);
    }
  }
  return out;
}

/** Capitale e guadagni composti di una tranche attiva al tempo t (0 se non attiva). */
function statoInvestimento(
  inv: Investimento,
  contributi: Contributo[],
  t: Date,
): { capitale: number; guadagni: number } {
  const inizio = new Date(inv.dataInizio + "T00:00:00");
  const fine = new Date(inv.dataFine + "T00:00:00");
  // Attiva finche' non entra nel mese di scadenza (poi e' maturata -> liquido).
  if (t < inizio || t >= inizioMese(fine)) return { capitale: 0, guadagni: 0 };
  let capitale = 0;
  let guadagni = 0;
  for (const c of contributi) {
    if (c.data > t) continue;
    capitale += c.importo;
    const anni = anniTra(c.data, t);
    if (anni > 0) guadagni += c.importo * (Math.pow(1 + inv.interesse, anni) - 1);
  }
  return { capitale, guadagni };
}

/** Valore a scadenza di una tranche (capitale + interessi composti fino a fine). */
function valoreMaturato(inv: Investimento, contributi: Contributo[]): number {
  const fine = new Date(inv.dataFine + "T00:00:00");
  let v = 0;
  for (const c of contributi) {
    const anni = anniTra(c.data, fine);
    v += c.importo * Math.pow(1 + inv.interesse, Math.max(0, anni));
  }
  return v;
}

export function calcolaProiezione(
  transazioni: Transazione[],
  tasse: AnnoTasse[],
  eventi: EventoFuturo[],
  investimenti: Investimento[],
  par: Parametri,
): ProiezioneRisultato {
  const saldo = calcolaSaldo(transazioni, tasse, par);
  const startIso = saldo.ultimo?.data ?? par.saldoInizialeData;
  const startValore = saldo.ultimo?.potereAcquisto ?? par.saldoInizialeValore ?? 0;
  const startProj = new Date(startIso + "T00:00:00");

  const nascita = new Date(par.dataNascita + "T00:00:00");
  const etaPensione = par.etaPensione ?? 67;
  const dataPensione = new Date(nascita);
  dataPensione.setFullYear(nascita.getFullYear() + etaPensione);

  // Precalcolo contributi, deduzioni dal liquido e maturazioni per mese.
  const contributiPer = new Map<string, Contributo[]>();
  const deduzioni = new Map<string, number>();
  const maturazioni = new Map<string, number>();
  let orizzonte = new Date(dataPensione);

  for (const inv of investimenti) {
    const contribs = contributiDi(inv);
    contributiPer.set(inv.id, contribs);
    const fine = new Date(inv.dataFine + "T00:00:00");
    if (fine > orizzonte) orizzonte = fine;
    // Versamenti futuri: escono dal liquido nel loro mese.
    for (const c of contribs) {
      if (c.data >= startProj) {
        const k = chiaveMese(c.data);
        deduzioni.set(k, (deduzioni.get(k) ?? 0) + c.importo);
      }
    }
    // Maturazione: capitale + interessi tornano liquidi nel mese di scadenza.
    const km = chiaveMese(fine);
    maturazioni.set(km, (maturazioni.get(km) ?? 0) + valoreMaturato(inv, contribs));
  }

  const eventiOrd = [...eventi].sort((a, b) =>
    a.dataInizio.localeCompare(b.dataInizio),
  );
  eventiOrd.forEach((e) => {
    const d = new Date((e.dataFine ?? e.dataInizio) + "T00:00:00");
    if (d > orizzonte) orizzonte = d;
  });

  function eventoAttivo(mese: Date): EventoFuturo | undefined {
    let att: EventoFuturo | undefined;
    for (const e of eventiOrd) {
      if (new Date(e.dataInizio + "T00:00:00") <= mese) att = e;
      else break;
    }
    return att;
  }

  const punti: PuntoProiezione[] = [];
  let liquido = startValore;
  let liquiditaMinima = liquido;
  let capitalePensione: number | undefined;
  let pensioneRegistrata = false;

  const cursore = inizioMese(startProj);
  cursore.setMonth(cursore.getMonth() + 1);

  while (cursore <= orizzonte) {
    const k = chiaveMese(cursore);

    // Risparmio mensile dello scenario attivo.
    const ev = eventoAttivo(cursore);
    if (ev) {
      const netto = (ev.fatturatoMensile ?? 0) * (1 - (ev.aliquota ?? 0));
      liquido += netto - (ev.spesaMensile ?? 0);
    }
    // Spese grosse del mese.
    for (const e of eventiOrd) {
      if (!e.spesaGrossa) continue;
      const d = new Date(e.dataInizio + "T00:00:00");
      if (d.getFullYear() === cursore.getFullYear() && d.getMonth() === cursore.getMonth())
        liquido -= e.spesaGrossa;
    }
    // Flussi verso/da investimenti.
    liquido -= deduzioni.get(k) ?? 0;
    liquido += maturazioni.get(k) ?? 0;

    // Stock investito e guadagni.
    let investito = 0;
    let guadagni = 0;
    for (const inv of investimenti) {
      const s = statoInvestimento(inv, contributiPer.get(inv.id)!, cursore);
      investito += s.capitale;
      guadagni += s.guadagni;
    }

    if (liquido < liquiditaMinima) liquiditaMinima = liquido;
    const totale = liquido + investito + guadagni;

    punti.push({
      data: `${k}-01`,
      eta: Math.round(anniTra(nascita, cursore) * 10) / 10,
      liquido: Math.round(liquido),
      investito: Math.round(investito),
      guadagni: Math.round(guadagni),
      totale: Math.round(totale),
    });

    if (!pensioneRegistrata && cursore >= dataPensione) {
      capitalePensione = totale;
      pensioneRegistrata = true;
    }
    cursore.setMonth(cursore.getMonth() + 1);
  }

  const tassoRendita = par.tassoRendita ?? 0.035;
  const renditaAnnua =
    capitalePensione !== undefined ? capitalePensione * tassoRendita : undefined;

  return {
    punti,
    patrimonioOggi: punti[0]?.totale,
    capitalePensione,
    dataPensione: `${dataPensione.getFullYear()}-${String(dataPensione.getMonth() + 1).padStart(2, "0")}-01`,
    renditaAnnua,
    renditaMensile: renditaAnnua !== undefined ? renditaAnnua / 12 : undefined,
    liquiditaMinima,
  };
}

/** Riduce i punti mensili per il grafico (uno ogni `passo` mesi, ultimo incluso). */
export function campionaMesi(
  punti: PuntoProiezione[],
  passo = 3,
): PuntoProiezione[] {
  if (punti.length <= passo) return punti;
  const out: PuntoProiezione[] = [];
  for (let i = 0; i < punti.length; i += passo) out.push(punti[i]);
  const ultimo = punti[punti.length - 1];
  if (out[out.length - 1]?.data !== ultimo.data) out.push(ultimo);
  return out;
}
