export function Proiezione() {
  return (
    <div className="card">
      <h3>Proiezione futura — in arrivo (Fasi 4-5)</h3>
      <p className="muted">
        Qui svilupperemo la stima del saldo futuro fino alla pensione,
        replicando <b>SpeseEntrateFuturi</b>, <b>Investimenti</b> e{" "}
        <b>SaldoFuturo</b>:
      </p>
      <ul className="muted">
        <li>
          Scenari di entrate/uscite negli anni con eventi di vita e spese grosse.
        </li>
        <li>
          Investimenti e interessi <b>in termini reali</b> (al netto
          dell'inflazione).
        </li>
        <li>
          Dashboard "pensione integrativa": capitale accumulato e rendita
          potenziale, con parametri editabili.
        </li>
      </ul>
    </div>
  );
}
