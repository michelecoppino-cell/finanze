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
let msalPromise: Promise<PublicClientApplication> | null = null;
let clientIdCorrente: string | null = null;

/**
 * True se questa pagina sta girando DENTRO la popup di login aperta da MSAL.
 * In quel caso non dobbiamo toccare MSAL: e' la finestra che ha aperto la popup
 * a leggere la risposta e chiudere la popup. Se invece elaborassimo qui la
 * risposta (handleRedirectPromise), la "ruberemmo" alla finestra principale,
 * causando timed_out di la' e no_token_request_cache_error di qua.
 */
function dentroPopupMsal(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.opener &&
    window.opener !== window &&
    typeof window.name === "string" &&
    window.name.startsWith("msal")
  );
}

/**
 * Crea (una sola volta) l'istanza MSAL per il client id dato, la inizializza e
 * completa un eventuale login tornato via redirect. La promise e' memoizzata per
 * evitare doppie inizializzazioni in caso di chiamate concorrenti.
 */
function getMsal(clientId: string): Promise<PublicClientApplication> {
  if (msalPromise && clientIdCorrente === clientId) return msalPromise;
  clientIdCorrente = clientId;
  msalPromise = (async () => {
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
    // Completa un login tornato via redirect SOLO se siamo la finestra normale,
    // mai dentro la popup di MSAL (vedi dentroPopupMsal).
    if (!dentroPopupMsal()) {
      const risposta = await istanza.handleRedirectPromise();
      if (risposta?.account) istanza.setActiveAccount(risposta.account);
    }
    msal = istanza;
    return istanza;
  })();
  return msalPromise;
}

/** True se l'errore indica che le popup non sono utilizzabili in questo contesto. */
function popupNonPermesso(e: unknown): boolean {
  const code = (e as { errorCode?: string })?.errorCode;
  return (
    code === "block_nested_popups" ||
    code === "popup_window_error" ||
    code === "empty_window_error"
  );
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
  // Dentro la popup di login non facciamo nulla: lasciamo che la finestra
  // principale completi il flusso e chiuda la popup.
  if (dentroPopupMsal()) return null;
  const m = await getMsal(clientId);
  const a = accountAttivo(m);
  if (a) m.setActiveAccount(a);
  return a ? nomeDi(a) : null;
}

/**
 * Login interattivo. Prova prima con popup; se il contesto non le consente (es.
 * la pagina e' aperta in una finestra con `opener`, errore block_nested_popups)
 * ripiega sul flusso a redirect: la pagina viene ricaricata e il login si
 * completa al ritorno (vedi getMsal → handleRedirectPromise). In quel caso la
 * funzione non ritorna un nome perche' la navigazione avviene prima.
 */
export async function collega(clientId: string): Promise<string> {
  const m = await getMsal(clientId);
  try {
    const res = await m.loginPopup({ scopes: SCOPES });
    m.setActiveAccount(res.account);
    return nomeDi(res.account);
  } catch (e) {
    if (popupNonPermesso(e)) {
      await m.loginRedirect({ scopes: SCOPES });
      return ""; // la pagina naviga via prima di arrivare qui
    }
    throw e;
  }
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
      try {
        const r = await m.acquireTokenPopup({ scopes: SCOPES, account: a });
        return r.accessToken;
      } catch (e2) {
        if (popupNonPermesso(e2)) {
          // Popup bloccate: rinnova l'accesso via redirect (la pagina ricarica).
          await m.acquireTokenRedirect({ scopes: SCOPES, account: a });
          throw new Error("Reindirizzamento a Microsoft per l'accesso…");
        }
        throw e2;
      }
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
