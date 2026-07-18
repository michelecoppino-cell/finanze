// Sincronizzazione del backup su OneDrive, interamente client-side via MSAL
// (login Microsoft) + Microsoft Graph. Nessun backend, nessun segreto: l'app
// e' un client pubblico (SPA) e usa il flusso PKCE gestito da MSAL.
//
// Privacy: si richiede solo lo scope "Files.ReadWrite.AppFolder", quindi l'app
// vede ESCLUSIVAMENTE la propria cartella dedicata (Apps/Finanze) su OneDrive,
// non il resto dei file dell'utente. Il backup e' un unico file JSON, lo stesso
// formato di export/import.

import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
} from "@azure/msal-browser";
import { DatiApp } from "../types";

const SCOPES = ["Files.ReadWrite.AppFolder"];
const NOME_FILE = "finanze.json";
// Endpoint della cartella-app dedicata su OneDrive (personale o work/school).
const GRAPH_FILE = `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${NOME_FILE}`;
const GRAPH_CONTENT = `${GRAPH_FILE}:/content`;

let msal: PublicClientApplication | null = null;
let clientIdCorrente: string | null = null;

/** Crea (una volta) l'istanza MSAL per il client id dato e la inizializza. */
async function getMsal(clientId: string): Promise<PublicClientApplication> {
  if (msal && clientIdCorrente === clientId) return msal;
  const istanza = new PublicClientApplication({
    auth: {
      clientId,
      // "common" copre sia account Microsoft personali sia work/school.
      authority: "https://login.microsoftonline.com/common",
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: "localStorage" },
  });
  await istanza.initialize();
  msal = istanza;
  clientIdCorrente = clientId;
  return istanza;
}

function accountAttivo(m: PublicClientApplication): AccountInfo | null {
  return m.getActiveAccount() ?? m.getAllAccounts()[0] ?? null;
}

function nomeDi(a: AccountInfo): string {
  return a.username || a.name || "collegato";
}

/** Nome dell'account attualmente collegato in questa sessione, o null. */
export function accountCollegato(): string | null {
  if (!msal) return null;
  const a = accountAttivo(msal);
  return a ? nomeDi(a) : null;
}

/**
 * Ripristina una sessione gia' esistente (token in cache) senza aprire popup.
 * Va chiamata all'avvio se c'e' un client id salvato, cosi' l'auto-salvataggio
 * riparte anche dopo un reload della pagina. Ritorna il nome account o null.
 */
export async function ripristinaSessione(clientId: string): Promise<string | null> {
  const m = await getMsal(clientId);
  const a = accountAttivo(m);
  if (a) m.setActiveAccount(a);
  return a ? nomeDi(a) : null;
}

/** Login interattivo (popup). Ritorna il nome dell'account collegato. */
export async function collega(clientId: string): Promise<string> {
  const m = await getMsal(clientId);
  const res = await m.loginPopup({ scopes: SCOPES });
  m.setActiveAccount(res.account);
  return nomeDi(res.account);
}

/** Scollega l'account: rimuove token e account dalla cache locale (senza popup). */
export async function scollega(clientId: string): Promise<void> {
  const m = await getMsal(clientId);
  await m.clearCache();
  m.setActiveAccount(null);
}

/** Access token per Graph: silenzioso se possibile, altrimenti con popup. */
async function token(clientId: string): Promise<string> {
  const m = await getMsal(clientId);
  const a = accountAttivo(m);
  if (!a) throw new Error("Non sei collegato a OneDrive.");
  try {
    const r = await m.acquireTokenSilent({ scopes: SCOPES, account: a });
    return r.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      const r = await m.acquireTokenPopup({ scopes: SCOPES, account: a });
      return r.accessToken;
    }
    throw e;
  }
}

/** Salva (sovrascrive) il backup nella cartella-app di OneDrive. */
export async function salvaSuOneDrive(
  clientId: string,
  dati: DatiApp,
): Promise<void> {
  const t = await token(clientId);
  const res = await fetch(GRAPH_CONTENT, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(dati, null, 2),
  });
  if (!res.ok) {
    throw new Error(`Salvataggio su OneDrive fallito (HTTP ${res.status}).`);
  }
}

/**
 * Scarica il testo del backup da OneDrive, o null se non esiste ancora.
 * Il chiamante lo passa a `importaJson` per normalizzarlo.
 */
export async function scaricaTestoDaOneDrive(
  clientId: string,
): Promise<string | null> {
  const t = await token(clientId);
  const res = await fetch(GRAPH_CONTENT, {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Lettura da OneDrive fallita (HTTP ${res.status}).`);
  }
  return res.text();
}

/** Data ultima modifica del backup su OneDrive (ISO), o null se non esiste. */
export async function ultimaModificaOneDrive(
  clientId: string,
): Promise<string | null> {
  const t = await token(clientId);
  const res = await fetch(GRAPH_FILE, {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Lettura info da OneDrive fallita (HTTP ${res.status}).`);
  }
  const j = (await res.json()) as { lastModifiedDateTime?: string };
  return j.lastModifiedDateTime ?? null;
}
