// Stima GREZZA e puramente informativa della pensione pubblica Inarcassa
// (previdenza obbligatoria degli ingegneri) col metodo contributivo. Serve solo
// a dare un ORDINE DI GRANDEZZA di quanto verra' dalla cassa, da affiancare —
// non da sommare ciecamente — alla rendita integrativa costruita col capitale.
//
//   montante     = Σ contributo SOGGETTIVO di ogni anno (passato dalle fatture,
//                  futuro proiettando l'ultimo soggettivo noto fino all'eta'
//                  pensione), in € REALI. La rivalutazione legale del montante
//                  (media quinquennale del PIL) storicamente ~ inflazione,
//                  quindi in termini reali si assume ~0: coerente con tutto il
//                  resto dell'app, che ragiona in potere d'acquisto di oggi.
//   pensione/anno = montante × coefficiente di trasformazione (dipende dall'eta'
//                  di pensionamento; parametro editabile, default ~5,5%).
//
// Solo il contributo SOGGETTIVO costruisce la pensione individuale: l'integrativo
// (4%) e la maternita' finanziano il sistema e non entrano nel montante.
//
// ATTENZIONE: il sistema previdenziale puo' cambiare (aliquote, coefficienti,
// eta', sostenibilita' della cassa). Questa e' una stima ottimistica-neutra, da
// prendere con le pinze e NON come entrata garantita.

import { AnnoTasse, Fattura, Parametri } from "../types";
import { anniConFatture, calcolaAnno } from "./fatture";

export interface StimaInarcassa {
  /** Somma reale dei contributi soggettivi (montante contributivo). */
  montante: number;
  /** Anni di contribuzione considerati (passati + proiettati). */
  anniContribuzione: number;
  /** Soggettivo medio annuo (montante / anni). */
  soggettivoMedio: number;
  /** Soggettivo annuo usato per proiettare gli anni futuri. */
  soggettivoFuturo: number;
  /** Anno stimato di pensionamento (nascita + eta' pensione). */
  annoPensione: number;
  /** Coefficiente di trasformazione applicato. */
  coeff: number;
  /** Pensione annua stimata (lorda). */
  pensioneAnnua: number;
  /** Pensione mensile su 13 mensilita'. */
  pensioneMensile: number;
}

/** Coefficiente di trasformazione di default (indicativo, eta' ~67-70). */
export const COEFF_TRASFORMAZIONE_DEFAULT = 0.055;

/**
 * Stima informativa della pensione Inarcassa. Restituisce `undefined` se non ci
 * sono fatture da cui ricavare lo storico dei contributi soggettivi.
 */
export function stimaPensioneInarcassa(
  fatture: Fattura[] | undefined,
  tasse: AnnoTasse[],
  par: Parametri,
): StimaInarcassa | undefined {
  if (!fatture || fatture.length === 0) return undefined;
  const byAnno = new Map(tasse.map((t) => [t.anno, t]));
  const anni = anniConFatture(fatture).sort((a, b) => a - b); // crescente

  // Soggettivo di ogni anno con fatture (passato + anno in corso).
  const soggettivoPerAnno = new Map<number, number>();
  for (const anno of anni) {
    const t = byAnno.get(anno);
    const c = calcolaAnno(anno, fatture, {
      ridotta: t?.inarcassaRidotta,
      maternita: t?.maternita,
    });
    soggettivoPerAnno.set(anno, c.soggettivo);
  }
  let montantePassato = 0;
  for (const v of soggettivoPerAnno.values()) montantePassato += v;

  // Soggettivo con cui proiettare il futuro: media degli ultimi (max 3) anni
  // noti, cosi' un singolo anno anomalo pesa meno.
  const ultimi = anni.slice(-3);
  const soggettivoFuturo =
    ultimi.reduce((s, a) => s + (soggettivoPerAnno.get(a) ?? 0), 0) /
    (ultimi.length || 1);

  const nascita = Number(par.dataNascita.slice(0, 4));
  const etaPensione = par.etaPensione ?? 67;
  const annoPensione = nascita + etaPensione;
  const ultimoAnnoNoto = anni[anni.length - 1];
  const anniFuturi = Math.max(0, annoPensione - ultimoAnnoNoto);
  const montanteFuturo = anniFuturi * soggettivoFuturo;

  const montante = montantePassato + montanteFuturo;
  const anniContribuzione = anni.length + anniFuturi;
  const coeff = par.coeffTrasformazioneInarcassa ?? COEFF_TRASFORMAZIONE_DEFAULT;
  const pensioneAnnua = montante * coeff;

  return {
    montante,
    anniContribuzione,
    soggettivoMedio: anniContribuzione > 0 ? montante / anniContribuzione : 0,
    soggettivoFuturo,
    annoPensione,
    coeff,
    pensioneAnnua,
    pensioneMensile: (pensioneAnnua / 13),
  };
}
