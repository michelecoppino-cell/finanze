// Motore della proiezione futura. Continua la curva del saldo reale ("potere
// d'acquisto") verso il futuro usando gli scenari di entrate/uscite
// (SpeseEntrateFuturi) e la crescita degli investimenti (Investimenti), il
// tutto in termini REALI (al netto dell'inflazione).
//
// Modello (versione pulita del foglio SaldoFuturo dell'Excel):
//   accantonato(t) = ultimo saldo reale
//                    + somma dei risparmi mensili (netto - spesa) fino a t
//                    - spese grosse fino a t
//   guadagniInv(t) = somma dei rendimenti degli investimenti attivi fino a t
//   ricchezza(t)   = accantonato(t) + guadagniInv(t)
//
// Il capitale investito resta "dentro" l'accantonato (come nell'Excel: G = C + F):
// aggiungiamo solo i guadagni, non ricontiamo il capitale.

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
  accantonato: number;
  guadagniInvestimenti: number;
  totale: number;
}

export interface ProiezioneRisultato {
  punti: PuntoProiezione[];
  capitalePensione?: number;
  dataPensione?: string;
  renditaAnnua?: number;
  renditaMensile?: number;
}

function anniTra(daIso: string, aData: Date): number {
  return (aData.getTime() - new Date(daIso + "T00:00:00").getTime()) / (365.25 * 86400000);
}

/** Guadagno (solo interessi, capitale escluso) di una tranche al tempo t. */
function guadagnoInvestimento(inv: Investimento, t: Date): number {
  const inizio = new Date(inv.dataInizio + "T00:00:00");
  const fine = new Date(inv.dataFine + "T00:00:00");
  if (t < inizio) return 0;
  const r = inv.interesse;
  const tEff = t < fine ? t : fine; // dopo la fine i guadagni si congelano

  const cresci = (importo: number, dallaData: Date) => {
    const anni = (tEff.getTime() - dallaData.getTime()) / (365.25 * 86400000);
    if (anni <= 0) return 0;
    return importo * (Math.pow(1 + r, anni) - 1);
  };

  let g = cresci(inv.capitale, inizio);

  // Piano di accumulo: versamenti periodici.
  if (inv.versamentoPeriodico && inv.frequenzaMesi) {
    const d = new Date(inizio);
    d.setMonth(d.getMonth() + inv.frequenzaMesi);
    while (d <= tEff && d <= fine) {
      g += cresci(inv.versamentoPeriodico, new Date(d));
      d.setMonth(d.getMonth() + inv.frequenzaMesi);
    }
  }
  return g;
}

export function calcolaProiezione(
  transazioni: Transazione[],
  tasse: AnnoTasse[],
  eventi: EventoFuturo[],
  investimenti: Investimento[],
  par: Parametri,
): ProiezioneRisultato {
  // Punto di partenza: ultimo saldo reale (potere d'acquisto), o il saldo iniziale.
  const saldo = calcolaSaldo(transazioni, tasse, par);
  const startIso = saldo.ultimo?.data ?? par.saldoInizialeData;
  const startValore = saldo.ultimo?.potereAcquisto ?? par.saldoInizialeValore ?? 0;

  const nascita = new Date(par.dataNascita + "T00:00:00");
  const etaPensione = par.etaPensione ?? 67;
  const dataPensione = new Date(nascita);
  dataPensione.setFullYear(nascita.getFullYear() + etaPensione);

  // Orizzonte: la data piu' lontana tra eventi, investimenti e pensione.
  let orizzonte = new Date(dataPensione);
  const consideraData = (iso?: string) => {
    if (!iso) return;
    const d = new Date(iso + "T00:00:00");
    if (d > orizzonte) orizzonte = d;
  };
  eventi.forEach((e) => {
    consideraData(e.dataInizio);
    consideraData(e.dataFine);
  });
  investimenti.forEach((i) => consideraData(i.dataFine));

  const eventiOrd = [...eventi].sort((a, b) =>
    a.dataInizio.localeCompare(b.dataInizio),
  );

  /** Evento attivo per un mese: l'ultimo iniziato entro quel mese. */
  function eventoAttivo(mese: Date): EventoFuturo | undefined {
    let att: EventoFuturo | undefined;
    for (const e of eventiOrd) {
      if (new Date(e.dataInizio + "T00:00:00") <= mese) att = e;
      else break;
    }
    return att;
  }

  const punti: PuntoProiezione[] = [];
  let accantonato = startValore;
  let capitalePensione: number | undefined;

  // Itera per mese dal mese successivo all'ultimo dato reale fino all'orizzonte.
  const cursore = new Date(startIso + "T00:00:00");
  cursore.setDate(1);
  cursore.setMonth(cursore.getMonth() + 1);

  let pensioneRegistrata = false;

  while (cursore <= orizzonte) {
    const meseIso = `${cursore.getFullYear()}-${String(cursore.getMonth() + 1).padStart(2, "0")}-01`;

    // Risparmio mensile dello scenario attivo.
    const ev = eventoAttivo(cursore);
    if (ev) {
      const netto = (ev.fatturatoMensile ?? 0) * (1 - (ev.aliquota ?? 0));
      accantonato += netto - (ev.spesaMensile ?? 0);
    }

    // Spese grosse che cadono in questo mese.
    for (const e of eventiOrd) {
      if (!e.spesaGrossa) continue;
      const d = new Date(e.dataInizio + "T00:00:00");
      if (
        d.getFullYear() === cursore.getFullYear() &&
        d.getMonth() === cursore.getMonth()
      ) {
        accantonato -= e.spesaGrossa;
      }
    }

    let guadagni = 0;
    for (const inv of investimenti) guadagni += guadagnoInvestimento(inv, cursore);

    const eta = anniTra(par.dataNascita, cursore);
    const totale = accantonato + guadagni;
    punti.push({
      data: meseIso,
      eta: Math.round(eta * 10) / 10,
      accantonato: Math.round(accantonato),
      guadagniInvestimenti: Math.round(guadagni),
      totale: Math.round(totale),
    });

    if (!pensioneRegistrata && cursore >= dataPensione) {
      capitalePensione = totale;
      pensioneRegistrata = true;
    }

    cursore.setMonth(cursore.getMonth() + 1);
  }

  const tassoRendita = par.tassoRendita ?? 0.04;
  const renditaAnnua =
    capitalePensione !== undefined ? capitalePensione * tassoRendita : undefined;

  return {
    punti,
    capitalePensione,
    dataPensione: `${dataPensione.getFullYear()}-${String(dataPensione.getMonth() + 1).padStart(2, "0")}-01`,
    renditaAnnua,
    renditaMensile: renditaAnnua !== undefined ? renditaAnnua / 12 : undefined,
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
