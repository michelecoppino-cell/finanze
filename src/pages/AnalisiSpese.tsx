import { useEffect, useMemo, useState } from "react";
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
import { euro, labelMese, annoMese } from "../util";
import { Info } from "../components/Info";

// Palette categorica (neutra, leggibile in chiaro e scuro).
const PALETTE = [
  "#4c78a8", "#f58518", "#54a24b", "#e45756", "#72b7b2",
  "#eeca3b", "#b279a2", "#ff9da6", "#9d755d", "#bab0ac",
  "#8cd17d", "#d4a6c8",
];

const CHIAVE_CATEGORIE_ESCLUSE = "finanze:analisiSpese:categorieEscluse";

function caricaCategorieEscluse(): Set<string> {
  try {
    const raw = localStorage.getItem(CHIAVE_CATEGORIE_ESCLUSE);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function AnalisiSpese() {
  const { dati } = useApp();
  const [vista, setVista] = useState<"mese" | "anno">("mese");
  const [cifra, setCifra] = useState<"media" | "totale">("media");
  const [da, setDa] = useState("");
  const [a, setA] = useState("");
  const [categorieEscluse, setCategorieEscluse] = useState<Set<string>>(
    caricaCategorieEscluse,
  );

  useEffect(() => {
    localStorage.setItem(
      CHIAVE_CATEGORIE_ESCLUSE,
      JSON.stringify([...categorieEscluse]),
    );
  }, [categorieEscluse]);

  function toggleCategoriaEsclusa(nome: string) {
    setCategorieEscluse((prev) => {
      const next = new Set(prev);
      if (next.has(nome)) next.delete(nome);
      else next.add(nome);
      return next;
    });
  }

  // Estremi disponibili (yyyy-mm) per popolare i selettori e i preset.
  const mesi = useMemo(() => {
    const s = new Set<string>();
    for (const t of dati.transazioni) s.add(annoMese(t.data));
    return [...s].sort();
  }, [dati.transazioni]);
  const primoMese = mesi[0] ?? "";
  const ultimoMese = mesi[mesi.length - 1] ?? "";

  // Applica il range temporale (inclusivo) e le categorie escluse prima
  // dell'analisi, cosi' spariscono ovunque: totali, grafico e tabella.
  const transazioniFiltrate = useMemo(() => {
    return dati.transazioni.filter((t) => {
      const m = annoMese(t.data);
      if (da && m < da) return false;
      if (a && m > a) return false;
      const cat = t.categoria?.trim();
      if (cat && categorieEscluse.has(cat)) return false;
      return true;
    });
  }, [dati.transazioni, da, a, categorieEscluse]);

  const analisi = useMemo(
    () =>
      analizza(
        transazioniFiltrate,
        dati.categorie.map((c) => c.nome),
        dati.mutui ?? [],
      ),
    [transazioniFiltrate, dati.categorie, dati.mutui],
  );

  const righe: RigaMese[] =
    vista === "anno" ? perAnno(analisi.mesi) : analisi.mesi;

  const coloreCat = useMemo(() => {
    const m: Record<string, string> = {};
    analisi.categorie.forEach((c, i) => (m[c] = PALETTE[i % PALETTE.length]));
    return m;
  }, [analisi.categorie]);

  // Numero di mesi coperti dal periodo selezionato (buchi inclusi), per la
  // media mensile: analisi.mesi e' gia' riempito mese per mese da analizza().
  const nMesi = analisi.mesi.length || 1;

  const datiGrafico = useMemo(
    () =>
      analisi.categorie
        .map((c) => {
          const totale = analisi.totalePerCategoria[c] ?? 0;
          return {
            categoria: c,
            totale,
            media: totale / nMesi,
            colore: coloreCat[c],
          };
        })
        .filter((d) => d.totale > 0)
        .sort((a, b) => b.totale - a.totale),
    [analisi, coloreCat, nMesi],
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

  // Preset di range comodi.
  const annoCorrente = new Date().getFullYear();
  function preset(nome: "tutto" | "annoCorrente" | "ultimi12" | "annoScorso") {
    if (nome === "tutto") {
      setDa("");
      setA("");
    } else if (nome === "annoCorrente") {
      setDa(`${annoCorrente}-01`);
      setA(`${annoCorrente}-12`);
    } else if (nome === "annoScorso") {
      setDa(`${annoCorrente - 1}-01`);
      setA(`${annoCorrente - 1}-12`);
    } else if (nome === "ultimi12") {
      const d = new Date();
      d.setMonth(d.getMonth() - 11);
      setDa(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      setA(`${annoCorrente}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
    }
  }

  const rangeAttivo = !!(da || a);

  return (
    <>
      <div className="card">
        <div className="riga-azioni" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Periodo analizzato</h3>
          <div className="riga-azioni" style={{ gap: 6 }}>
            <button className="secondario" onClick={() => preset("tutto")}>
              Tutto
            </button>
            <button className="secondario" onClick={() => preset("ultimi12")}>
              Ultimi 12 mesi
            </button>
            <button className="secondario" onClick={() => preset("annoCorrente")}>
              {annoCorrente}
            </button>
            <button className="secondario" onClick={() => preset("annoScorso")}>
              {annoCorrente - 1}
            </button>
          </div>
        </div>
        <div className="riga-azioni" style={{ marginTop: 10 }}>
          <label className="filtro-campo">
            <span>Da</span>
            <input
              type="month"
              value={da}
              min={primoMese}
              max={ultimoMese}
              onChange={(e) => setDa(e.target.value)}
            />
          </label>
          <label className="filtro-campo">
            <span>A</span>
            <input
              type="month"
              value={a}
              min={primoMese}
              max={ultimoMese}
              onChange={(e) => setA(e.target.value)}
            />
          </label>
          <span className="muted">
            {rangeAttivo
              ? `${da ? labelMese(da + "-01") : labelMese(primoMese + "-01")} → ${
                  a ? labelMese(a + "-01") : labelMese(ultimoMese + "-01")
                }`
              : "Tutto il periodo disponibile"}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="riga-azioni" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>
            Categorie escluse
            <Info>
              Clicca una categoria per escluderla dall'analisi: sparisce dai
              totali, dal grafico e dalla tabella, come se quelle transazioni
              non esistessero. Utile per spese una tantum che sballano le
              medie (es. l'acquisto di una casa). La scelta resta salvata su
              questo dispositivo.
            </Info>
          </h3>
          {categorieEscluse.size > 0 && (
            <button className="secondario" onClick={() => setCategorieEscluse(new Set())}>
              Includi tutte
            </button>
          )}
        </div>
        <div className="riga-azioni" style={{ marginTop: 10, flexWrap: "wrap" }}>
          {dati.categorie.map((c) => {
            const esclusa = categorieEscluse.has(c.nome);
            return (
              <button
                key={c.nome}
                className="secondario"
                style={{
                  opacity: esclusa ? 0.5 : 1,
                  textDecoration: esclusa ? "line-through" : "none",
                }}
                onClick={() => toggleCategoriaEsclusa(c.nome)}
              >
                {c.nome}
              </button>
            );
          })}
        </div>
      </div>

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
          <div className="etichetta">
            di cui tasse
            <Info>
              Somma delle uscite con il flag <b>Tasse</b> nel periodo
              selezionato (già comprese nelle uscite totali).
            </Info>
          </div>
          <div className="valore">{euro(analisi.totaleTasse)}</div>
        </div>
        {analisi.totaleMutuoCapitale > 0 && (
          <div className="stat">
            <div className="etichetta">
              Mutuo — quota capitale
              <Info>
                Parte delle rate di mutuo (movimenti marcati <b>Mutuo</b>) che
                rimborsa il debito: è un investimento nell'immobile, non una
                spesa. La quota interessi del periodo compare invece tra le
                spese come categoria &quot;Mutuo (interessi)&quot;. Il riparto
                segue il piano di ammortamento configurato in{" "}
                <b>Impostazioni</b>.
              </Info>
            </div>
            <div className="valore">{euro(analisi.totaleMutuoCapitale)}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              equity immobile, non spesa
            </div>
          </div>
        )}
        {analisi.totaleTrasferimenti > 0 && (
          <div className="stat">
            <div className="etichetta">
              Trasferito a investimenti
              <Info>
                Somma delle uscite marcate <b>Giro</b> nel periodo: giroconti e
                PAC. Non contano come spese (sono esclusi dalle uscite totali e
                dalle categorie).
              </Info>
            </div>
            <div className="valore">{euro(analisi.totaleTrasferimenti)}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              giroconti/PAC, non spese
            </div>
          </div>
        )}
        <div className="stat">
          <div className="etichetta">
            Saldo netto
            <Info>
              <b>Saldo netto</b> = entrate − uscite del periodo (trasferimenti
              e voci annullate esclusi).
              <br />
              {euro(analisi.totaleEntrate, true)} −{" "}
              {euro(analisi.totaleUscite, true)} = <b>{euro(saldoNetto, true)}</b>
            </Info>
          </div>
          <div className={"valore " + (saldoNetto >= 0 ? "entrata" : "uscita")}>
            {euro(saldoNetto)}
          </div>
        </div>
        <div className="stat">
          <div className="etichetta">
            Tasso di risparmio
            <Info>
              <b>Tasso di risparmio</b> = saldo netto / entrate totali.
              <br />
              {euro(saldoNetto, true)} / {euro(analisi.totaleEntrate, true)} ={" "}
              <b>
                {analisi.totaleEntrate > 0
                  ? ((saldoNetto / analisi.totaleEntrate) * 100).toFixed(0) + "%"
                  : "—"}
              </b>
            </Info>
          </div>
          <div className="valore">
            {analisi.totaleEntrate > 0
              ? ((saldoNetto / analisi.totaleEntrate) * 100).toFixed(0) + "%"
              : "—"}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            quota di entrate risparmiata
          </div>
        </div>
      </div>

      <div className="card">
        <div className="riga-azioni" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>
            {cifra === "media" ? "Spesa mensile media per categoria" : "Spese per categoria"}{" "}
            <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
              · {rangeAttivo ? "periodo selezionato" : "tutto il periodo"}
            </span>
          </h3>
          <div className="riga-azioni" style={{ gap: 0 }}>
            <button
              className={cifra === "media" ? "primario" : "secondario"}
              onClick={() => setCifra("media")}
              style={{ borderRadius: "8px 0 0 8px" }}
            >
              Media mensile
            </button>
            <button
              className={cifra === "totale" ? "primario" : "secondario"}
              onClick={() => setCifra("totale")}
              style={{ borderRadius: "0 8px 8px 0" }}
            >
              Totale periodo
            </button>
          </div>
        </div>
        <div style={{ width: "100%", height: 300, marginTop: 10 }}>
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
                formatter={(v: number) =>
                  euro(v, true) + (cifra === "media" ? "/mese" : "")
                }
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--bordo)",
                  borderRadius: 8,
                  color: "var(--testo)",
                }}
              />
              <Bar dataKey={cifra} radius={[4, 4, 0, 0]}>
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
