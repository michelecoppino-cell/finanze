import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { useApp } from "../store/AppStore";
import { analizza, perAnno, RigaMese } from "../engine/analisi";
import { euro, labelMese } from "../util";

// Palette categorica (neutra, leggibile in chiaro e scuro).
const PALETTE = [
  "#4c78a8", "#f58518", "#54a24b", "#e45756", "#72b7b2",
  "#eeca3b", "#b279a2", "#ff9da6", "#9d755d", "#bab0ac",
  "#8cd17d", "#d4a6c8",
];

export function AnalisiSpese() {
  const { dati } = useApp();
  const [vista, setVista] = useState<"mese" | "anno">("mese");

  const analisi = useMemo(
    () => analizza(dati.transazioni, dati.categorie.map((c) => c.nome)),
    [dati.transazioni, dati.categorie],
  );

  const righe: RigaMese[] =
    vista === "anno" ? perAnno(analisi.mesi) : analisi.mesi;

  const coloreCat = useMemo(() => {
    const m: Record<string, string> = {};
    analisi.categorie.forEach((c, i) => (m[c] = PALETTE[i % PALETTE.length]));
    return m;
  }, [analisi.categorie]);

  const datiGrafico = useMemo(
    () =>
      analisi.categorie
        .map((c) => ({
          categoria: c,
          totale: analisi.totalePerCategoria[c] ?? 0,
          colore: coloreCat[c],
        }))
        .filter((d) => d.totale > 0)
        .sort((a, b) => b.totale - a.totale),
    [analisi, coloreCat],
  );

  if (dati.transazioni.length === 0) {
    return (
      <div className="card vuoto">
        Nessun dato da analizzare. Importa i movimenti dalla pagina{" "}
        <b>Movimenti</b>.
      </div>
    );
  }

  const saldoNetto = analisi.totaleEntrate - analisi.totaleUscite;

  return (
    <>
      <div className="stat-griglia">
        <div className="stat">
          <div className="etichetta">Entrate totali</div>
          <div className="valore entrata">{euro(analisi.totaleEntrate)}</div>
        </div>
        <div className="stat">
          <div className="etichetta">Uscite totali</div>
          <div className="valore uscita">{euro(analisi.totaleUscite)}</div>
        </div>
        <div className="stat">
          <div className="etichetta">di cui tasse</div>
          <div className="valore">{euro(analisi.totaleTasse)}</div>
        </div>
        <div className="stat">
          <div className="etichetta">Saldo netto</div>
          <div className={"valore " + (saldoNetto >= 0 ? "entrata" : "uscita")}>
            {euro(saldoNetto)}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Spese per categoria</h3>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <BarChart
              data={datiGrafico}
              margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bordo)" />
              <XAxis
                dataKey="categoria"
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                angle={-25}
                textAnchor="end"
                height={70}
                interval={0}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickFormatter={(v) => euro(v)}
                width={70}
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
              <Bar dataKey="totale" radius={[4, 4, 0, 0]}>
                {datiGrafico.map((d) => (
                  <Cell key={d.categoria} fill={d.colore} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="riga-azioni" style={{ marginBottom: 12 }}>
        <div className="riga-azioni" style={{ gap: 0 }}>
          <button
            className={vista === "mese" ? "primario" : "secondario"}
            onClick={() => setVista("mese")}
            style={{ borderRadius: "8px 0 0 8px" }}
          >
            Per mese
          </button>
          <button
            className={vista === "anno" ? "primario" : "secondario"}
            onClick={() => setVista("anno")}
            style={{ borderRadius: "0 8px 8px 0" }}
          >
            Per anno
          </button>
        </div>
      </div>

      <div className="tabella-wrap">
        <table>
          <thead>
            <tr>
              <th>{vista === "anno" ? "Anno" : "Mese"}</th>
              {analisi.categorie.map((c) => (
                <th key={c} className="num" style={{ color: coloreCat[c] }}>
                  {c}
                </th>
              ))}
              <th className="num">Tot. uscite</th>
              <th className="num">Entrate</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.mese}>
                <td>{vista === "anno" ? r.mese : labelMese(r.mese)}</td>
                {analisi.categorie.map((c) => (
                  <td key={c} className="num">
                    {r.perCategoria[c] ? euro(r.perCategoria[c]) : ""}
                  </td>
                ))}
                <td className="num uscita">{euro(r.totaleUscite)}</td>
                <td className="num entrata">{euro(r.totaleEntrate)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Totale</th>
              {analisi.categorie.map((c) => (
                <th key={c} className="num">
                  {euro(analisi.totalePerCategoria[c])}
                </th>
              ))}
              <th className="num">{euro(analisi.totaleUscite)}</th>
              <th className="num">{euro(analisi.totaleEntrate)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
