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
import { calcolaSaldo, campiona, PuntoSaldo } from "../engine/saldo";
import { equityImmobili } from "../engine/mutuo";
import { euro, toIso, mappaColoriConto } from "../util";
import { Info } from "../components/Info";

const COLORI = {
  grezzo: "#8a94a6",
  nettoTasse: "#4c78a8",
  totale: "#54a24b",
};

const NOME_SALDO_TOTALE = "Saldo totale";
const NOME_SALDO_GREZZO = "Saldo grezzo";
const NOME_SALDO_COMPRENSIVO = "Saldo con ETF e immobile";

export function Saldo() {
  const { dati } = useApp();
  const [da, setDa] = useState("");
  const [a, setA] = useState("");
  const [nascoste, setNascoste] = useState<Set<string>>(new Set());
  const [mostraGrezzo, setMostraGrezzo] = useState(true);
  const [mostraComprensivo, setMostraComprensivo] = useState(false);

  const ris = useMemo(
    () => calcolaSaldo(dati.transazioni, dati.tasse, dati.parametri),
    [dati.transazioni, dati.tasse, dati.parametri],
  );

  // Componenti del saldo, per le spiegazioni (i). Annullate escluse, come nei calcoli.
  const somme = useMemo(() => {
    let entrate = 0;
    let uscite = 0;
    let tassePagate = 0;
    for (const t of dati.transazioni) {
      if (t.annullata) continue;
      entrate += t.entrate ?? 0;
      uscite += t.uscite ?? 0;
      if (t.tasse && t.uscite) tassePagate += t.uscite;
    }
    return { entrate, uscite, tassePagate };
  }, [dati.transazioni]);

  // Equity immobiliare dai mutui configurati (anticipo + capitale rimborsato).
  const mutui = dati.mutui ?? [];
  const equityImmobile = useMemo(
    () => (mutui.length > 0 ? equityImmobili(mutui, toIso(new Date())) : 0),
    [mutui],
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

  const datiGraficoBase = useMemo(() => campiona(puntiRange, 7), [puntiRange]);

  // Il comprensivo aggiunge l'equity immobiliare storica ad ogni punto (non
  // solo quella di oggi), cosi' la curva riflette l'andamento nel tempo.
  const datiGrafico = useMemo(
    () =>
      datiGraficoBase.map((p: PuntoSaldo) => ({
        ...p,
        comprensivo: round2(
          p.nettoTasse +
            p.investito +
            (mutui.length > 0 ? equityImmobili(mutui, p.data) : 0),
        ),
      })),
    [datiGraficoBase, mutui],
  );

  const conti = ris.conti;
  const coloreConto = useMemo(() => mappaColoriConto(conti), [conti]);

  function alternaLinea(nome: string) {
    setNascoste((prev) => {
      const next = new Set(prev);
      if (next.has(nome)) next.delete(nome);
      else next.add(nome);
      return next;
    });
  }

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
          <div className="etichetta">
            Saldo grezzo
            <Info>
              <b>Saldo grezzo</b> = saldo iniziale + entrate − uscite dai
              movimenti (voci annullate escluse).
              <br />
              {euro(dati.parametri.saldoInizialeValore, true)} (al{" "}
              {dati.parametri.saldoInizialeData}) +{" "}
              {euro(somme.entrate, true)} − {euro(somme.uscite, true)} ={" "}
              <b>{euro(u?.grezzo, true)}</b>
            </Info>
          </div>
          <div className="valore">{euro(u?.grezzo)}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            soldi effettivi sul conto
          </div>
        </div>
        <div className="stat">
          <div className="etichetta">
            Netto tasse
            <Info>
              <b>Netto tasse</b> = saldo grezzo − tasse maturate + tasse già
              pagate.
              <br />
              Le tasse annue (pagina <b>Tasse</b>) vengono spalmate
              giorno-per-giorno come se fossero accantonate; i pagamenti reali
              (movimenti col flag Tasse, {euro(somme.tassePagate, true)})
              vengono riaggiunti per non contarli due volte.
              <br />
              {euro(u?.grezzo, true)} −{" "}
              {euro(
                u
                  ? u.grezzo - u.nettoTasse + somme.tassePagate
                  : undefined,
                true,
              )}{" "}
              + {euro(somme.tassePagate, true)} = <b>{euro(u?.nettoTasse, true)}</b>
            </Info>
          </div>
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
              <div className="etichetta">
                Investito (giroconti)
                <Info>
                  Somma delle uscite marcate <b>Giro</b> (trasferimenti verso
                  altri conti/PAC): sono uscite dal conto ma non spese, quindi
                  restano nel patrimonio come capitale investito.
                </Info>
              </div>
              <div className="valore">{euro(u?.investito)}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                trasferito su altri conti/PAC
              </div>
            </div>
            <div className="stat">
              <div className="etichetta">
                Patrimonio totale
                <Info>
                  <b>Patrimonio totale</b> = netto tasse + investito.
                  <br />
                  {euro(u?.nettoTasse, true)} + {euro(u?.investito, true)} ={" "}
                  <b>{euro(u?.totale, true)}</b>
                </Info>
              </div>
              <div className="valore" style={{ color: COLORI.totale }}>
                {euro(u?.totale)}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                netto tasse + investito
              </div>
            </div>
          </>
        )}
        {equityImmobile > 0 && (
          <>
            <div className="stat">
              <div className="etichetta">
                Immobile (equity)
                <Info>
                  Anticipo + capitale rimborsato con le rate scadute, dal piano
                  di ammortamento dei mutui configurati in <b>Impostazioni</b>.
                  Le rate e l'anticipo sono già uscite dal conto: qui la parte
                  investita rientra nel patrimonio.
                </Info>
              </div>
              <div className="valore">{euro(equityImmobile)}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                anticipo + capitale rimborsato
              </div>
            </div>
            <div className="stat">
              <div className="etichetta">
                Patrimonio con immobile
                <Info>
                  Netto tasse + investito (giroconti) + equity immobiliare.
                  <br />
                  {euro(u?.nettoTasse, true)} + {euro(u?.investito ?? 0, true)}{" "}
                  + {euro(equityImmobile, true)} ={" "}
                  <b>
                    {euro(
                      u ? u.nettoTasse + (u.investito ?? 0) + equityImmobile : undefined,
                      true,
                    )}
                  </b>
                </Info>
              </div>
              <div className="valore" style={{ color: COLORI.totale }}>
                {euro(
                  u ? u.nettoTasse + (u.investito ?? 0) + equityImmobile : undefined,
                )}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                incluso l'immobile (al costo)
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
          <b>{NOME_SALDO_TOTALE}</b>: saldo netto tasse su tutti i conti — i
          soldi davvero tuoi, con le tasse (forfettario + Inarcassa)
          accantonate giorno-per-giorno.
          {conti.length > 0 && (
            <>
              {" "}
              <b>Saldo per conto</b>: andamento grezzo (senza tasse) del
              singolo conto.
            </>
          )}{" "}
          Clicca sulla legenda per accendere/spegnere ciascuna curva.
        </p>
        <div className="riga-azioni" style={{ marginBottom: 10, gap: 16 }}>
          <label className="filtro-campo" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={mostraComprensivo}
              onChange={(e) => setMostraComprensivo(e.target.checked)}
            />
            <span>{NOME_SALDO_COMPRENSIVO}</span>
          </label>
          <label className="filtro-campo" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={mostraGrezzo}
              onChange={(e) => setMostraGrezzo(e.target.checked)}
            />
            <span>{NOME_SALDO_GREZZO}</span>
          </label>
        </div>
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
              <Legend
                onClick={(e) => alternaLinea(String(e.value))}
                formatter={(value: string) => (
                  <span
                    style={{
                      opacity: nascoste.has(value) ? 0.4 : 1,
                      cursor: "pointer",
                    }}
                  >
                    {value}
                  </span>
                )}
              />
              <Line
                type="monotone"
                dataKey="nettoTasse"
                name={NOME_SALDO_TOTALE}
                stroke={COLORI.nettoTasse}
                hide={nascoste.has(NOME_SALDO_TOTALE)}
                dot={false}
                strokeWidth={2}
              />
              {conti.map((c) => {
                const nome = `Saldo ${c}`;
                return (
                  <Line
                    key={c}
                    type="monotone"
                    dataKey={(p: PuntoSaldo & { comprensivo: number }) => p.perConto[c]}
                    name={nome}
                    stroke={coloreConto[c]}
                    hide={nascoste.has(nome)}
                    dot={false}
                    strokeWidth={1.5}
                  />
                );
              })}
              {mostraComprensivo && (
                <Line
                  type="monotone"
                  dataKey="comprensivo"
                  name={NOME_SALDO_COMPRENSIVO}
                  stroke={COLORI.totale}
                  dot={false}
                  strokeWidth={2}
                />
              )}
              {mostraGrezzo && (
                <Line
                  type="monotone"
                  dataKey="grezzo"
                  name={NOME_SALDO_GREZZO}
                  stroke={COLORI.grezzo}
                  dot={false}
                  strokeWidth={1.5}
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
