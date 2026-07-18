// Modello dati dell'app. Ricalca la struttura dei fogli dell'Excel di partenza,
// riorganizzata in modo piu' pulito e senza formule fragili.

/** Un movimento del conto (foglio "Transazioni"). */
export interface Transazione {
  id: string;
  /** Data operazione (ISO yyyy-mm-dd). */
  data: string;
  tipologia?: string; // Tipologia (Bonifico, POS, ...)
  causale?: string; // Causale / descrizione
  stato?: string; // Eseguito / In attesa
  entrate?: number; // colonna F
  uscite?: number; // colonna G
  /** Flag "fattura" (Excel: colonna H = "x"). Il movimento e' un incasso da fattura. */
  fattura?: boolean;
  /** Flag "tasse" (Excel: colonna I = "x"). Il movimento e' un pagamento di tasse. */
  tasse?: boolean;
  /** Categoria di spesa/entrata (Excel: colonna J). */
  categoria?: string;
  note?: string; // colonna K
}

/** Categoria di spesa/entrata (foglio "Dati"). */
export interface Categoria {
  nome: string;
  colore?: string;
  tipo?: "spesa" | "entrata";
}

/** Dati fiscali per anno (foglio "Tasse"): forfettario + Inarcassa. */
export interface AnnoTasse {
  anno: number;
  inarcassa?: number; // D - contributo Inarcassa dell'anno
  irpef?: number; // E - IRPEF / imposta sostitutiva
  aggiuntivi?: number; // F - aggiuntivi ipotizzati
  fatturato?: number; // J - fatturato dell'anno
  tassazione?: number; // K - aliquota (decimale, es. 0.1865)
}

/** Evento della proiezione futura (foglio "SpeseEntrateFuturi"). */
export interface EventoFuturo {
  id: string;
  descrizione: string;
  dataInizio: string; // ISO
  dataFine?: string; // ISO (se assente, fino all'evento successivo)
  fatturatoMensile?: number; // G
  aliquota?: number; // per calcolare l'entrata netta H = G*(1-aliquota)
  spesaMensile?: number; // I
  /** Spesa grossa una-tantum in dataInizio (Excel: colonna L). */
  spesaGrossa?: number;
}

/** Tranche di investimento (foglio "Investimenti"). */
export interface Investimento {
  id: string;
  descrizione?: string;
  dataInizio: string; // ISO
  dataFine: string; // ISO
  capitale: number; // D - capitale iniziale
  /** Tasso annuo (reale, gia' al netto di inflazione/tasse a seconda della scelta). */
  interesse: number; // E
  /** Piano di accumulo: importo aggiunto periodicamente (opzionale). */
  versamentoPeriodico?: number;
  /** Ogni quanti mesi si aggiunge il versamento (es. 12 = ogni anno). */
  frequenzaMesi?: number;
}

/** Parametri globali editabili. */
export interface Parametri {
  /** Punto di partenza noto del saldo (Excel: Saldo!C2). */
  saldoInizialeData: string;
  saldoInizialeValore: number;
  /** Data di nascita, per calcolare l'eta' nella proiezione. */
  dataNascita: string;
  /** Inflazione annua usata per portare tutto in potere d'acquisto reale. */
  inflazione: number;
  /** Eta' a cui stimare il capitale per la pensione integrativa (default 67). */
  etaPensione?: number;
  /** Tasso di prelievo annuo per stimare la rendita integrativa (default 0.04 = 4%). */
  tassoRendita?: number;
  /** Hash della password del gate (SHA-256 hex). Assente = nessuna password. */
  passwordHash?: string;
  /** OneDrive: Application (client) ID dell'app registrata su Azure (SPA). */
  oneDriveClientId?: string;
  /** Se true, salva il backup su OneDrive automaticamente a ogni modifica. */
  oneDriveAutoSync?: boolean;
}

/** L'intero stato dell'app: un solo oggetto JSON esportabile/importabile. */
export interface DatiApp {
  versione: number;
  transazioni: Transazione[];
  categorie: Categoria[];
  tasse: AnnoTasse[];
  eventiFuturi: EventoFuturo[];
  investimenti: Investimento[];
  parametri: Parametri;
}

export const VERSIONE_DATI = 1;

/** Categorie di default (dal foglio "Dati" dell'Excel). */
export const CATEGORIE_DEFAULT: Categoria[] = [
  { nome: "Spesa/casa", tipo: "spesa" },
  { nome: "Abbonamenti", tipo: "spesa" },
  { nome: "Benzina", tipo: "spesa" },
  { nome: "Auto", tipo: "spesa" },
  { nome: "Cene/Ape", tipo: "spesa" },
  { nome: "Regali", tipo: "spesa" },
  { nome: "Ferie", tipo: "spesa" },
  { nome: "Extra", tipo: "spesa" },
  { nome: "Contanti", tipo: "spesa" },
  { nome: "Messico/Lavoro", tipo: "spesa" },
  { nome: "Da fare", tipo: "spesa" },
];

/** Stato iniziale vuoto dell'app. */
export function datiVuoti(): DatiApp {
  return {
    versione: VERSIONE_DATI,
    transazioni: [],
    categorie: CATEGORIE_DEFAULT,
    tasse: [],
    eventiFuturi: [],
    investimenti: [],
    parametri: {
      saldoInizialeData: "2017-01-01",
      saldoInizialeValore: 6400,
      dataNascita: "1994-03-22",
      inflazione: 0.02,
      etaPensione: 67,
      tassoRendita: 0.035,
    },
  };
}
