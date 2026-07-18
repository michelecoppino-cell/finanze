export function Saldo() {
  return (
    <div className="card">
      <h3>Saldo reale — in arrivo (Fase 3)</h3>
      <p className="muted">
        Qui ricostruiremo la curva del saldo giorno-per-giorno, replicando la
        logica del tuo foglio <b>Saldo</b>:
      </p>
      <ul className="muted">
        <li>
          <b>Saldo grezzo</b> — cumulato di entrate/uscite dai movimenti.
        </li>
        <li>
          <b>Riadattamento tasse</b> — quota tasse spalmata giorno-per-giorno
          (forfettario + Inarcassa) al posto dei pagamenti a scatti.
        </li>
        <li>
          <b>Mensilizzazione fatture</b> — incassi da fattura distribuiti sul
          mese di competenza: la tua curva di potere d'acquisto reale.
        </li>
      </ul>
      <p className="muted">
        Prima però servono i dati fiscali per anno (foglio <b>Tasse</b>) e le
        <b> fatture</b>: li aggiungeremo insieme al modulo.
      </p>
    </div>
  );
}
