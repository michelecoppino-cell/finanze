// Shell dell'app: navigazione tra i moduli. Usa lo stato locale (niente router)
// per restare un semplice sito statico deployabile ovunque.

import { useEffect, useState } from "react";
import { Movimenti } from "./pages/Movimenti";
import { AnalisiSpese } from "./pages/AnalisiSpese";
import { Saldo } from "./pages/Saldo";
import { Tasse } from "./pages/Tasse";
import { Proiezione } from "./pages/Proiezione";
import { Impostazioni } from "./pages/Impostazioni";
import { useApp } from "./store/AppStore";

// MSAL/OneDrive caricato on-demand per non appesantire il bundle iniziale.
const onedrive = () => import("./store/onedrive");

// Chiave del client id in localStorage (deve combaciare con onedrive.ts).
function clientIdLocale(fallback?: string): string {
  let ls: string | null = null;
  try {
    ls = localStorage.getItem("finanze.onedrive.clientId");
  } catch {
    /* localStorage non disponibile */
  }
  return (fallback ?? ls ?? "").trim();
}

/**
 * Avviso mostrato in cima all'app quando OneDrive e' configurato (c'e' un client
 * id) ma non e' stato eseguito l'accesso: propone il login a pagina intera.
 */
function BannerOneDrive() {
  const { dati, caricato } = useApp();
  const cid = dati.parametri.oneDriveClientId;
  const [collegato, setCollegato] = useState<boolean | null>(null);

  useEffect(() => {
    if (!caricato) return;
    const clientId = clientIdLocale(cid);
    if (!clientId) {
      setCollegato(null); // non configurato: niente banner, niente MSAL
      return;
    }
    let annulla = false;
    void onedrive()
      .then((m) => m.ripristinaSessione(clientId))
      .then((u) => {
        if (!annulla) setCollegato(!!u);
      })
      .catch(() => {
        if (!annulla) setCollegato(false);
      });
    return () => {
      annulla = true;
    };
  }, [cid, caricato]);

  if (collegato !== false) return null;

  function accedi() {
    const clientId = clientIdLocale(cid);
    if (clientId) void onedrive().then((m) => m.collega(clientId));
  }

  return (
    <div
      className="card"
      style={{
        borderColor: "var(--accento, #4c78a8)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span>☁️ OneDrive è configurato ma non hai eseguito l'accesso.</span>
      <button className="primario" onClick={accedi}>
        Accedi con Microsoft
      </button>
    </div>
  );
}

type Pagina =
  | "movimenti"
  | "analisi"
  | "saldo"
  | "tasse"
  | "proiezione"
  | "impostazioni";

const VOCI: { id: Pagina; nome: string; icona: string }[] = [
  { id: "movimenti", nome: "Movimenti", icona: "≡" },
  { id: "analisi", nome: "Analisi spese", icona: "▤" },
  { id: "saldo", nome: "Saldo reale", icona: "◈" },
  { id: "tasse", nome: "Tasse", icona: "%" },
  { id: "proiezione", nome: "Proiezione", icona: "◹" },
  { id: "impostazioni", nome: "Impostazioni", icona: "⚙" },
];

export function App() {
  const [pagina, setPagina] = useState<Pagina>("movimenti");
  const [menuAperto, setMenuAperto] = useState(false);

  return (
    <div className="layout">
      <aside className={"sidebar" + (menuAperto ? " aperta" : "")}>
        <div className="logo">Finanze</div>
        <nav>
          {VOCI.map((v) => (
            <button
              key={v.id}
              className={"nav-voce" + (pagina === v.id ? " attiva" : "")}
              onClick={() => {
                setPagina(v.id);
                setMenuAperto(false);
              }}
            >
              <span className="icona">{v.icona}</span>
              {v.nome}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer muted">v0.1 · dati solo nel browser</div>
      </aside>

      <div className="contenuto">
        <header className="topbar">
          <button
            className="hamburger"
            onClick={() => setMenuAperto((v) => !v)}
            aria-label="Menu"
          >
            ☰
          </button>
          <span className="titolo-pagina">
            {VOCI.find((v) => v.id === pagina)?.nome}
          </span>
        </header>
        <main className="pagina">
          <BannerOneDrive />
          {pagina === "movimenti" && <Movimenti />}
          {pagina === "analisi" && <AnalisiSpese />}
          {pagina === "saldo" && <Saldo />}
          {pagina === "tasse" && <Tasse />}
          {pagina === "proiezione" && <Proiezione />}
          {pagina === "impostazioni" && <Impostazioni />}
        </main>
      </div>
    </div>
  );
}
