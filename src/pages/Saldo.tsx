import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useApp } from "../store/AppStore";
import { calcolaSaldo, campiona } from "../engine/saldo";
import { euro } from "../util";

const COLORI = {
  grezzo: "#8a94a6",
  nettoTasse: "#4c78a8",
  potereAcquisto: "#54a24b",
};

export function Saldo() {
  const { dati } = useApp();

  const ris = useMemo(
    () => calcolaSaldo(dati.transazioni, dati.tasse, dati.parametri),
    [dati.transazioni, dati.tasse, dati.parametri],
  );

  const datiGrafico = useMemo(() => campiona(ris.punti, 7), [ris.punti]);

  if (dati.transazioni.length === 0) {
    return (
      <div className="card vuoto">
        Nessun movimento. Importa i dati (CSV o backup JSON da{" "}
        <b>Impostazioni</b>) per vedere il saldo.
      </div>
    );
  }

  const u = ris.ultimo;

  return (
    <>
      <div className="stat-griglia">
        <div className="stat">
          <div className="etichetta">Saldo grezzo</div>
          <div className="valore">{euro(u?.grezzo)}</div>
        </div>
        <div className="stat">
          <div className="etichetta">Netto tasse</div>
          <div className="valore" style={{ color: COLORI.nettoTasse }}>
            {euro(u?.nettoTasse)}
          </div>
        </div>
        <div className="stat">
          <div className="etichetta">Potere d'acquisto</div>
          <div className="valore" style={{ color: COLORI.potereAcquisto }}>
            {euro(u?.potereAcquisto)}
          </div>
        </div>
        <div className="stat">
          <div className="etichetta">Ultimo dato</div>
          <div className="valore" style={{ fontSize: 18 }}>
            {u?.data ?? "—"}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Andamento del saldo</h3>
        <p className="muted" style={{ marginTop: -4 }}>
          <b>Grezzo</b>: saldo reale del conto. <b>Netto tasse</b>: con le tasse
          (forfettario + Inarcassa) accantonate giorno-per-giorno.{" "}
          <b>Potere d'acquisto</b>: anche con gli incassi da fattura distribuiti
          sul mese di competenza.
        </p>
        <div style={{ width: "100%", height: 360 }}>
          <ResponsiveContainer>
            <LineChart
              data={datiGrafico}
              margin={{ top: 8, right: 12, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bordo)" />
              <XAxis
                dataKey="data"
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickFormatter={(v: string) => v.slice(0, 7)}
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickFormatter={(v) => euro(v)}
                width={72}
              />
              <Tooltip
                formatter={(v: number) => euro(v, true)}
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--bordo)",
                  borderRadius: 8,
                  color: "var(--testo)",
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="grezzo"
                name="Grezzo"
                stroke={COLORI.grezzo}
                dot={false}
                strokeWidth={1.5}
              />
              <Line
                type="monotone"
                dataKey="nettoTasse"
                name="Netto tasse"
                stroke={COLORI.nettoTasse}
                dot={false}
                strokeWidth={1.5}
              />
              <Line
                type="monotone"
                dataKey="potereAcquisto"
                name="Potere d'acquisto"
                stroke={COLORI.potereAcquisto}
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {dati.tasse.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Non hai ancora inserito i dati fiscali per anno: le curve "netto
            tasse" e "potere d'acquisto" coincidono col grezzo. Aggiungili nella
            pagina <b>Tasse</b>.
          </p>
        </div>
      )}
    </>
  );
}
