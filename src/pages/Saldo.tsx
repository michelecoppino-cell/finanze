import { useMemo, useState } from "react";
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
  totale: "#54a24b",
};

export function Saldo() {
  const { dati } = useApp();
  const [da, setDa] = useState("");
  const [a, setA] = useState("");

  const ris = useMemo(
    () => calcolaSaldo(dati.transazioni, dati.tasse, dati.parametri),
    [dati.transazioni, dati.tasse, dati.parametri],
  );

  const primaData = ris.punti[0]?.data ?? "";
  const ultimaData = ris.ultimo?.data ?? "";

  // C'è almeno un trasferimento da mostrare?
  const haInvestito = (ris.ultimo?.investito ?? 0) > 0;

  const puntiRange = useMemo(() => {
    if (!da && !a) return ris.punti;
    return ris.punti.filter((p) => {
      if (da && p.data < da) return false;
      if (a && p.data > a) return false;
      return true;
    });
  }, [ris.punti, da, a]);

  const datiGrafico = useMemo(() => campiona(puntiRange, 7), [puntiRange]);

  if (dati.transazioni.length === 0) {
    return (
      <div className="card vuoto">
        Nessun movimento. Importa i dati (CSV o backup JSON da{" "}
        <b>Impostazioni</b>) per vedere il saldo.
      </div>
    );
  }

  const u = ris.ultimo;
  const annoCorrente = new Date().getFullYear();

  function preset(nome: "tutto" | "ultimoAnno" | "ultimi3" | "annoCorrente") {
    if (nome === "tutto") {
      setDa("");
      setA("");
      return;
    }
    setA(ultimaData);
    const d = new Date(ultimaData + "T00:00:00");
    if (nome === "ultimoAnno") d.setFullYear(d.getFullYear() - 1);
    else if (nome === "ultimi3") d.setFullYear(d.getFullYear() - 3);
    else if (nome === "annoCorrente") {
      setDa(`${annoCorrente}-01-01`);
      return;
    }
    setDa(d.toISOString().slice(0, 10));
  }

  return (
    <>
      <div className="stat-griglia">
        <div className="stat">
          <div className="etichetta">Saldo grezzo</div>
          <div className="valore">{euro(u?.grezzo)}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            soldi effettivi sul conto
          </div>
        </div>
        <div className="stat">
          <div className="etichetta">Netto tasse</div>
          <div className="valore" style={{ color: COLORI.nettoTasse }}>
            {euro(u?.nettoTasse)}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            tasse accantonate
          </div>
        </div>
        {haInvestito && (
          <>
            <div className="stat">
              <div className="etichetta">Investito (giroconti)</div>
              <div className="valore">{euro(u?.investito)}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                trasferito su altri conti/PAC
              </div>
            </div>
            <div className="stat">
              <div className="etichetta">Patrimonio totale</div>
              <div className="valore" style={{ color: COLORI.totale }}>
                {euro(u?.totale)}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                netto tasse + investito
              </div>
            </div>
          </>
        )}
        <div className="stat">
          <div className="etichetta">Ultimo dato</div>
          <div className="valore" style={{ fontSize: 18 }}>
            {u?.data ?? "—"}
          </div>
        </div>
      </div>

      <div className="card">
        <div
          className="riga-azioni"
          style={{ justifyContent: "space-between", marginBottom: 10 }}
        >
          <h3 style={{ margin: 0 }}>Andamento del saldo</h3>
          <div className="riga-azioni" style={{ gap: 6 }}>
            <button className="secondario" onClick={() => preset("tutto")}>
              Tutto
            </button>
            <button className="secondario" onClick={() => preset("ultimoAnno")}>
              Ultimo anno
            </button>
            <button className="secondario" onClick={() => preset("ultimi3")}>
              Ultimi 3 anni
            </button>
            <button
              className="secondario"
              onClick={() => preset("annoCorrente")}
            >
              {annoCorrente}
            </button>
          </div>
        </div>
        <div className="riga-azioni" style={{ marginBottom: 10 }}>
          <label className="filtro-campo">
            <span>Da</span>
            <input
              type="date"
              value={da}
              min={primaData}
              max={ultimaData}
              onChange={(e) => setDa(e.target.value)}
            />
          </label>
          <label className="filtro-campo">
            <span>A</span>
            <input
              type="date"
              value={a}
              min={primaData}
              max={ultimaData}
              onChange={(e) => setA(e.target.value)}
            />
          </label>
        </div>
        <p className="muted" style={{ marginTop: -4 }}>
          <b>Grezzo</b>: i soldi effettivamente sul conto. <b>Netto tasse</b>:
          con le tasse (forfettario + Inarcassa) accantonate giorno-per-giorno —
          i soldi davvero tuoi.
          {haInvestito && (
            <>
              {" "}
              <b>Patrimonio totale</b>: aggiunge il capitale trasferito su altri
              conti/PAC, che non sparisce ma diventa investito.
            </>
          )}
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
                strokeWidth={2}
              />
              {haInvestito && (
                <Line
                  type="monotone"
                  dataKey="totale"
                  name="Patrimonio totale"
                  stroke={COLORI.totale}
                  dot={false}
                  strokeWidth={2}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {dati.tasse.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Non hai ancora inserito i dati fiscali per anno: la curva "netto
            tasse" coincide col grezzo. Aggiungili nella pagina <b>Tasse</b>.
          </p>
        </div>
      )}
    </>
  );
}
