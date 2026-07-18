// Shell dell'app: navigazione tra i moduli. Usa lo stato locale (niente router)
// per restare un semplice sito statico deployabile ovunque.

import { useState } from "react";
import { Movimenti } from "./pages/Movimenti";
import { AnalisiSpese } from "./pages/AnalisiSpese";
import { Saldo } from "./pages/Saldo";
import { Proiezione } from "./pages/Proiezione";
import { Impostazioni } from "./pages/Impostazioni";

type Pagina = "movimenti" | "analisi" | "saldo" | "proiezione" | "impostazioni";

const VOCI: { id: Pagina; nome: string; icona: string }[] = [
  { id: "movimenti", nome: "Movimenti", icona: "≡" },
  { id: "analisi", nome: "Analisi spese", icona: "▤" },
  { id: "saldo", nome: "Saldo reale", icona: "◈" },
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
          {pagina === "movimenti" && <Movimenti />}
          {pagina === "analisi" && <AnalisiSpese />}
          {pagina === "saldo" && <Saldo />}
          {pagina === "proiezione" && <Proiezione />}
          {pagina === "impostazioni" && <Impostazioni />}
        </main>
      </div>
    </div>
  );
}
