import { useEffect, useRef, useState, type JSX } from "react";
import { geoEquirectangular, geoOrthographic, geoPath } from "d3-geo";
import heroTrend from "../assets/heroTrend.json";
import { land } from "../WorldMap";
import { DEMO_VIDEO, driveEmbedUrl, hasPlayableVideo, youtubeEmbedUrl } from "../config/demo";
import { Icon, Terra, VERDICT_TEXT } from "../ui";
import { ThemeToggle } from "../theme";

/** The team research paper (PDF in web/public/paper), opened from the hero. */
const RESEARCH_PAPER = "/paper/terra-scope-research-paper.pdf";

// Public landing page shown before the application. It loads no map or analysis data: everything here is
// static text about features that exist today, plus a small precomputed trend grid for the hero globe (real NASA data).

const FEATURES = [
  { icon: "globe", tag: "Map", tint: "#e3f1ea", title: "Explore Earth", href: "#explore", text: "Real NASA data on a world map and 3D globe." },
  { icon: "trend", tag: "Statistics", tint: "#fde9da", title: "Detect Trends", href: "#explore", text: "See how fast a place is changing, and if it is real." },
  { icon: "hunt", tag: "Compare", tint: "#e2ecf8", title: "Compare Regions", href: "#hunt", text: "Put two places side by side, tested fairly." },
  { icon: "detective", tag: "AI", tint: "#ede6fb", title: "Ask the AI Detective", href: "#detective", text: "Ask in plain words. Every answer shows its evidence." },
  { icon: "science", tag: "Modes", tint: "#fff3cf", title: "Choose Your Level", href: "#start", text: "Explorer for plain words, Scientist for full statistics." },
  { icon: "report", tag: "Share", tint: "#f6e4ee", title: "Create a Report", href: null, text: "Turn your findings into a shareable PDF." },
] as const;

/** Small schematic previews of each feature (drawings of the interface, not results). */
const FEATURE_ART: Record<string, () => JSX.Element> = {
  globe: () => (
    <svg viewBox="0 0 220 120" aria-hidden="true">
      <circle cx="110" cy="62" r="50" fill="#f6f1e8" stroke="#2e2850" strokeWidth="5" />
      <clipPath id="fa-g"><circle cx="110" cy="62" r="47" /></clipPath>
      <g clipPath="url(#fa-g)">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((i) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((j) => {
          const v = (i * 7 + j * 3) % 10;
          const c = v < 2 ? "#7fb2e5" : v < 3 ? "#cfe1f4" : v < 6 ? "#f2a65a" : v < 8 ? "#fbe0c4" : "#c4621a";
          return <rect key={`${i}-${j}`} x={60 + i * 10} y={12 + j * 10} width="9.2" height="9.2" fill={c} />;
        }))}
      </g>
      <path d="M150 20c-9 0-15 7-15 15 0 11 15 25 15 25s15-14 15-25c0-8-6-15-15-15z" fill="#2b2540" />
      <circle cx="150" cy="35" r="5.5" fill="#fff" />
    </svg>),
  trend: () => (
    <svg viewBox="0 0 220 120" aria-hidden="true">
      <path d="M20 100h185M20 100V18" stroke="#c9bfae" strokeWidth="2" />
      <polyline fill="none" stroke="#7a7290" strokeWidth="2.4" strokeLinejoin="round"
        points="24,84 38,74 52,88 66,70 80,78 94,64 108,72 122,56 136,66 150,50 164,58 178,42 192,50 202,36" />
      <path d="M24 86L202 40" stroke="#c4621a" strokeWidth="4" strokeLinecap="round" />
      <rect x="112" y="92" width="96" height="22" rx="11" fill="#2b2540" />
      <text x="160" y="107" textAnchor="middle" fill="#fff" fontSize="10.5" fontWeight="800" fontFamily="Nunito, sans-serif">Significant trend</text>
    </svg>),
  hunt: () => (
    <svg viewBox="0 0 220 120" aria-hidden="true">
      <rect x="14" y="22" width="78" height="78" rx="16" fill="#fff" stroke="#f2a65a" strokeWidth="3" />
      <rect x="128" y="22" width="78" height="78" rx="16" fill="#fff" stroke="#7fb2e5" strokeWidth="3" />
      <text x="53" y="44" textAnchor="middle" fontSize="13" fontWeight="800" fill="#2b2540" fontFamily="Nunito, sans-serif">Place A</text>
      <text x="167" y="44" textAnchor="middle" fontSize="13" fontWeight="800" fill="#2b2540" fontFamily="Nunito, sans-serif">Place B</text>
      <path d="M53 88V56M41 68l12-12 12 12" stroke="#c4621a" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M167 56v32M155 76l12 12 12-12" stroke="#2f6fb3" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="110" cy="61" r="15" fill="#2b2540" />
      <text x="110" y="65.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff" fontFamily="Nunito, sans-serif">vs</text>
    </svg>),
  detective: () => (
    <svg viewBox="0 0 220 120" aria-hidden="true">
      <rect x="70" y="10" width="138" height="30" rx="15" fill="#2b2540" />
      <text x="139" y="29.5" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff" fontFamily="Nunito, sans-serif">Is rain changing here?</text>
      <rect x="12" y="50" width="160" height="58" rx="16" fill="#fff" />
      <rect x="26" y="62" width="120" height="7" rx="3.5" fill="#d9d2e6" />
      <rect x="26" y="75" width="92" height="7" rx="3.5" fill="#d9d2e6" />
      <rect x="26" y="89" width="70" height="12" rx="6" fill="#d8ecff" />
      <text x="61" y="98.2" textAnchor="middle" fontSize="8" fontWeight="800" fill="#1d4f86" fontFamily="Nunito, sans-serif">Evidence</text>
      <circle cx="194" cy="84" r="16" fill="#7fb2e5" /><circle cx="189" cy="81" r="2.2" fill="#2b2540" /><circle cx="199" cy="81" r="2.2" fill="#2b2540" />
      <path d="M189 89q5 4 10 0" stroke="#2b2540" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>),
  science: () => (
    <svg viewBox="0 0 220 120" aria-hidden="true">
      <rect x="20" y="14" width="180" height="40" rx="20" fill="#fff" stroke="#e5dccb" strokeWidth="2" />
      <rect x="24" y="18" width="86" height="32" rx="16" fill="#2b2540" />
      <text x="67" y="38.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff" fontFamily="Nunito, sans-serif">Explorer</text>
      <text x="153" y="38.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#2b2540" fontFamily="Nunito, sans-serif">Scientist</text>
      <rect x="20" y="66" width="150" height="40" rx="12" fill="#fff" />
      <rect x="32" y="77" width="96" height="7" rx="3.5" fill="#d9d2e6" />
      <rect x="32" y="90" width="70" height="7" rx="3.5" fill="#d9d2e6" />
      <circle cx="188" cy="86" r="15" fill="#6b53b5" />
      <text x="188" y="92" textAnchor="middle" fontSize="17" fontWeight="800" fill="#fff" fontFamily="Nunito, sans-serif">?</text>
    </svg>),
  report: () => (
    <svg viewBox="0 0 220 120" aria-hidden="true">
      <rect x="62" y="16" width="80" height="98" rx="8" fill="#fff" stroke="#d9d2e6" strokeWidth="2" transform="rotate(-6 102 65)" />
      <rect x="78" y="10" width="80" height="98" rx="8" fill="#fff" stroke="#2b2540" strokeWidth="2.5" />
      <rect x="88" y="20" width="44" height="7" rx="3.5" fill="#2b2540" />
      <rect x="88" y="32" width="60" height="5" rx="2.5" fill="#d9d2e6" />
      {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={90 + i * 9} y={70 - [8, 14, 10, 20, 18, 26][i]} width="6" height={[8, 14, 10, 20, 18, 26][i]} rx="1.5" fill={i % 2 ? "#f2a65a" : "#c4621a"} />)}
      <rect x="88" y="80" width="60" height="5" rx="2.5" fill="#d9d2e6" /><rect x="88" y="90" width="42" height="5" rx="2.5" fill="#d9d2e6" />
      <rect x="146" y="78" width="40" height="22" rx="7" fill="#e8735a" />
      <text x="166" y="93" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff" fontFamily="Nunito, sans-serif">PDF</text>
    </svg>),
};

const SOURCES = [
  { kind: "Satellite estimate", art: "satellite", tint: "#e2ecf8", name: "GPM IMERG", product: "GPM_3IMERGM V07", center: "NASA GES DISC",
    what: "Monthly rainfall from satellites, checked against rain gauges.",
    vars: ["Precipitation"], url: "https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGM_07/summary" },
  { kind: "Land surface model", art: "land", tint: "#e3f1ea", name: "GLDAS Noah", product: "GLDAS_NOAH025_M 2.1", center: "NASA GES DISC",
    what: "Water and energy at the land surface, from the top 10 cm down to 2 m.",
    vars: ["Soil moisture (4 layers)", "Root-zone soil water", "Snow water", "Air temperature", "Evapotranspiration", "Potential evapotranspiration"],
    url: "https://disc.gsfc.nasa.gov/datasets/GLDAS_NOAH025_M_2.1/summary" },
  { kind: "Reanalysis", art: "reanalysis", tint: "#fde9da", name: "MERRA-2", product: "M2IMNXASM / M2TMNXAER 5.12.4", center: "NASA GES DISC",
    what: "Air temperature over land and sea, and the haze of dust, smoke and pollution.",
    vars: ["Air temperature (land and sea)", "Air haze (all aerosols, desert dust)"], url: "https://disc.gsfc.nasa.gov/datasets/M2IMNXASM_5.12.4/summary" },
  { kind: "Satellite measurement", art: "modis", tint: "#e8f4dc", name: "MODIS Terra", product: "MOD13C2 / MOD11C3 V061", center: "NASA LP DAAC",
    what: "How green the plants are and how hot the ground is, seen from orbit.",
    vars: ["Vegetation greenness (NDVI)", "Land surface temperature (day and night)"], url: "https://lpdaac.usgs.gov/products/mod13c2v061/" },
  { kind: "Satellite measurement", art: "smap", tint: "#efe6f8", name: "SMAP", product: "SPL3SMP V009", center: "NASA NSIDC DAAC",
    what: "Water in the top 5 cm of soil, measured by radiometer since 2015.",
    vars: ["Soil moisture (surface)"], url: "https://nsidc.org/data/spl3smp/versions/9" },
  { kind: "Satellite measurement", art: "seawifs", tint: "#dcefef", name: "SeaWiFS", product: "SeaWiFS L3m CHL R2022.0", center: "NASA OB.DAAC",
    what: "Ocean colour: how much algae floats near the sea surface (2001 to 2010 in the app).",
    vars: ["Ocean chlorophyll"], url: "https://doi.org/10.5067/ORBVIEW-2/SeaWiFS/L3M/CHL/2022.0" },
  { kind: "Satellite gravity", art: "satellite", tint: "#e6e9fb", name: "GRACE and GRACE-FO", product: "JPL Mascon RL06.3 · GRACE-DA-DM v3.0", center: "NASA JPL / GSFC",
    what: "Twin satellites weigh the water on land; a NASA model turns that into weekly drought maps.",
    vars: ["Land water storage", "Drought (root zone)", "Groundwater drought"], url: "https://doi.org/10.5067/TEMSC-3JC634" },
  { kind: "Satellite detection", art: "modis", tint: "#fde3d8", name: "Fire: FIRMS and MiCASA", product: "MCD14ML C6.1 · MICASA_FLUX_M v1", center: "NASA FIRMS / GES DISC",
    what: "Every fire MODIS spots from orbit, and the carbon fires release each month.",
    vars: ["Number of fires", "Fire carbon"], url: "https://firms.modaps.eosdis.nasa.gov/download/" },
] as const;

/** Schematic drawings of each kind of evidence (not data). */
const SOURCE_ART: Record<string, () => JSX.Element> = {
  modis: () => (
    <svg viewBox="0 0 160 90" aria-hidden="true">
      <path d="M10 82h140" stroke="#2b2540" strokeWidth="3" strokeLinecap="round" />
      <g transform="rotate(-12 80 22)">
        <rect x="50" y="16" width="20" height="11" rx="2" fill="#7fb2e5" stroke="#2b2540" strokeWidth="2" />
        <rect x="90" y="16" width="20" height="11" rx="2" fill="#7fb2e5" stroke="#2b2540" strokeWidth="2" />
        <path d="M70 22h20" stroke="#2b2540" strokeWidth="2.5" />
        <rect x="73" y="12" width="14" height="19" rx="4" fill="#fff" stroke="#2b2540" strokeWidth="2.5" />
      </g>
      <path d="M80 38l-28 40h56z" fill="#f6c94c" fillOpacity=".25" />
      <path d="M44 82V62M44 70c-8-2-12-8-10-12 6 0 10 5 10 12zM44 66c6-4 12-4 14 0-4 4-10 4-14 0z" fill="#5fae7d" stroke="#2f6b46" strokeWidth="1.5" />
      <rect x="106" y="54" width="8" height="22" rx="4" fill="#fff" stroke="#2b2540" strokeWidth="2" />
      <circle cx="110" cy="78" r="6" fill="#e8735a" stroke="#2b2540" strokeWidth="2" />
      <path d="M110 74V62" stroke="#e8735a" strokeWidth="3" strokeLinecap="round" />
    </svg>),
  smap: () => (
    <svg viewBox="0 0 160 90" aria-hidden="true">
      <rect x="14" y="58" width="132" height="24" fill="#a9825c" />
      <path d="M14 58h132" stroke="#2b2540" strokeWidth="3" strokeLinecap="round" />
      {[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={30 + i * 24} cy={68 + (i % 2) * 6} r="2.6" fill="#7fb2e5" />)}
      <circle cx="80" cy="22" r="13" fill="#fff" stroke="#2b2540" strokeWidth="2.5" />
      <path d="M68 22h24M80 10v24" stroke="#c9bfae" strokeWidth="1.5" />
      <path d="M58 30l-10 4M102 30l10 4" stroke="#2b2540" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M70 38q10 8 20 0M64 46q16 12 32 0" fill="none" stroke="#7d6fb0" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 4" />
    </svg>),
  seawifs: () => (
    <svg viewBox="0 0 160 90" aria-hidden="true">
      <path d="M10 56q12-8 24 0t24 0t24 0t24 0t24 0t24 0V84H10z" fill="#7fb2e5" />
      <path d="M10 56q12-8 24 0t24 0t24 0t24 0t24 0t24 0" fill="none" stroke="#2b2540" strokeWidth="2.5" strokeLinecap="round" />
      {[[30, 66], [52, 72], [70, 64], [96, 70], [118, 66], [136, 74], [84, 78]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="#5fae7d" />)}
      <g transform="rotate(10 80 20)">
        <rect x="56" y="14" width="18" height="10" rx="2" fill="#7fb2e5" stroke="#2b2540" strokeWidth="2" />
        <rect x="88" y="14" width="18" height="10" rx="2" fill="#7fb2e5" stroke="#2b2540" strokeWidth="2" />
        <path d="M74 19h14" stroke="#2b2540" strokeWidth="2.5" />
        <rect x="76" y="10" width="12" height="18" rx="4" fill="#fff" stroke="#2b2540" strokeWidth="2.5" />
      </g>
    </svg>),
  satellite: () => (
    <svg viewBox="0 0 160 90" aria-hidden="true">
      <path d="M10 82h140" stroke="#2b2540" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 82c6-10 16-10 22 0M98 82c8-12 22-12 30 0" fill="#9edbb5" />
      <g transform="rotate(-18 80 26)">
        <rect x="44" y="20" width="22" height="12" rx="2" fill="#7fb2e5" stroke="#2b2540" strokeWidth="2" />
        <rect x="94" y="20" width="22" height="12" rx="2" fill="#7fb2e5" stroke="#2b2540" strokeWidth="2" />
        <path d="M66 26h28" stroke="#2b2540" strokeWidth="2.5" />
        <rect x="72" y="16" width="16" height="20" rx="4" fill="#fff" stroke="#2b2540" strokeWidth="2.5" />
      </g>
      <path d="M80 44l-22 30M80 44l22 30" stroke="#7fb2e5" strokeWidth="2" strokeDasharray="4 4" />
      {[[62, 58], [76, 66], [92, 56], [100, 70], [70, 74]].map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x} ${y}q-3 5 0 7q3-2 0-7z`} fill="#2f6fb3" />))}
    </svg>),
  land: () => (
    <svg viewBox="0 0 160 90" aria-hidden="true">
      <rect x="14" y="40" width="132" height="14" fill="#c9a47e" />
      <rect x="14" y="54" width="132" height="14" fill="#a9825c" />
      <rect x="14" y="68" width="132" height="14" rx="0" fill="#8a6644" />
      <path d="M14 40h132" stroke="#2b2540" strokeWidth="3" strokeLinecap="round" />
      <path d="M48 40V22M48 30c-8-2-12-8-10-12 6 0 10 5 10 12zM48 26c6-4 12-4 14 0-4 4-10 4-14 0z" fill="#5fae7d" stroke="#2f6b46" strokeWidth="1.5" />
      <path d="M48 40v12M48 46l-6 6M48 46l6 6" stroke="#f6f1e8" strokeWidth="1.6" strokeLinecap="round" />
      {[0, 1, 2, 3].map((i) => <circle key={i} cx={96 + i * 12} cy={62 + (i % 2) * 6} r="2.4" fill="#7fb2e5" />)}
      <path d="M104 30q6-14 12 0q6-14 12 0" fill="none" stroke="#c4621a" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M116 36v-16M110 24l6-6 6 6" fill="none" stroke="#7a7290" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>),
  reanalysis: () => (
    <svg viewBox="0 0 160 90" aria-hidden="true">
      <circle cx="80" cy="46" r="32" fill="#f6f1e8" stroke="#2e2850" strokeWidth="3" />
      <path d="M48 46h64M80 14c-14 10-14 54 0 64M80 14c14 10 14 54 0 64M54 28h52M54 64h52" fill="none" stroke="#c9bfae" strokeWidth="1.6" />
      <path d="M62 36c6-6 16-4 16 4s-10 10-14 6-6-6-2-10zM86 54c6-4 14-2 14 4s-8 8-12 6-4-6-2-10z" fill="#9edbb5" />
      <circle cx="18" cy="22" r="6" fill="#fff" stroke="#2b2540" strokeWidth="2" />
      <circle cx="142" cy="24" r="6" fill="#fff" stroke="#2b2540" strokeWidth="2" />
      <circle cx="20" cy="72" r="6" fill="#fff" stroke="#2b2540" strokeWidth="2" />
      <circle cx="140" cy="70" r="6" fill="#fff" stroke="#2b2540" strokeWidth="2" />
      <path d="M25 25l18 9M135 27l-18 8M27 69l17-8M133 67l-17-7" stroke="#e8735a" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" />
    </svg>),
};

const STEPS = [
  { title: "Select", text: "Pick a variable, a NASA dataset, a place and the years.", art: "select" },
  { title: "Explore", text: "See where it is rising or falling on the world map.", art: "explore" },
  { title: "Analyse", text: "The backend computes the trend per decade and tests it.", art: "analyse" },
  { title: "Explain", text: "Terra explains the result in plain words, with the evidence attached.", art: "explain" },
] as const;

/** Small schematic drawings of each step (interface sketches, not results). */
const STEP_ART: Record<string, () => JSX.Element> = {
  select: () => (
    <svg viewBox="0 0 120 70" aria-hidden="true">
      {[["Rainfall", 10], ["Mekong Delta", 30], ["2001 to 2025", 50]].map(([t, y]) => (
        <g key={t as string}>
          <rect x="10" y={y as number} width="100" height="15" rx="7.5" fill="#fff" stroke="#d9d2e6" strokeWidth="1.5" />
          <circle cx="20" cy={(y as number) + 7.5} r="3.5" fill="#6b53b5" />
          <text x="29" y={(y as number) + 11} fontSize="9" fontWeight="800" fill="#2b2540" fontFamily="Nunito, sans-serif">{t}</text>
        </g>))}
    </svg>),
  explore: () => (
    <svg viewBox="0 0 120 70" aria-hidden="true">
      <rect x="10" y="6" width="100" height="58" rx="10" fill="#fff" stroke="#d9d2e6" strokeWidth="1.5" />
      {[0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [0, 1, 2, 3, 4].map((j) => {
        const v = (i * 5 + j * 7) % 9;
        const c = v < 2 ? "#7fb2e5" : v < 3 ? "#cfe1f4" : v < 5 ? "#fbe0c4" : v < 7 ? "#f2a65a" : v < 8 ? "#c4621a" : "#e4e1ea";
        return <rect key={`${i}-${j}`} x={17 + i * 11} y={12 + j * 10} width="10" height="9" rx="2" fill={c} />;
      }))}
    </svg>),
  analyse: () => (
    <svg viewBox="0 0 120 70" aria-hidden="true">
      <path d="M12 60h98M12 60V8" stroke="#c9bfae" strokeWidth="1.8" />
      {[[20, 48], [30, 40], [40, 50], [50, 36], [60, 42], [70, 30], [80, 36], [90, 22], [100, 28]].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="2.8" fill="#7a7290" />))}
      <path d="M18 50L104 22" stroke="#c4621a" strokeWidth="3.2" strokeLinecap="round" />
      <rect x="64" y="48" width="44" height="16" rx="8" fill="#2b2540" />
      <text x="86" y="59" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff" fontFamily="Nunito, sans-serif">tested</text>
    </svg>),
  explain: () => (
    <svg viewBox="0 0 120 70" aria-hidden="true">
      <path d="M14 10h76a8 8 0 0 1 8 8v26a8 8 0 0 1-8 8H40l-12 10v-10H14a8 8 0 0 1-8-8V18a8 8 0 0 1 8-8z" fill="#fff" stroke="#d9d2e6" strokeWidth="1.5" />
      <rect x="16" y="20" width="62" height="6" rx="3" fill="#d9d2e6" />
      <rect x="16" y="31" width="46" height="6" rx="3" fill="#d9d2e6" />
      <rect x="66" y="36" width="26" height="10" rx="5" fill="#d8ecff" />
      <circle cx="104" cy="52" r="11" fill="#8cc4ee" /><circle cx="100.5" cy="50" r="1.8" fill="#2b2540" /><circle cx="107.5" cy="50" r="1.8" fill="#2b2540" />
      <path d="M100.5 55q3.5 3 7 0" stroke="#2b2540" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>),
};

const TRUST = [
  { title: "Real NASA data", tint: "#e2ecf8", icon: "data",
    text: "Every map and chart is computed from NASA data. Nothing is simulated." },
  { title: "Real statistics", tint: "#fde9da", icon: "stats",
    text: "Seasonal Mann-Kendall test, Sen's slope and false discovery rate control." },
  { title: "Honest answers", tint: "#ede6fb", icon: "honest",
    text: "Too little data? It says so. The AI only repeats computed numbers." },
] as const;

const TRUST_ICON: Record<string, () => JSX.Element> = {
  data: () => (
    <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
      <ellipse cx="24" cy="12" rx="14" ry="5" fill="#fff" stroke="#2f6fb3" strokeWidth="2.4" />
      <path d="M10 12v24c0 3 6 5 14 5s14-2 14-5V12M10 24c0 3 6 5 14 5s14-2 14-5" fill="none" stroke="#2f6fb3" strokeWidth="2.4" />
    </svg>),
  stats: () => (
    <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
      <path d="M8 40h34M8 40V8" stroke="#7a7290" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M12 34L40 14" stroke="#c4621a" strokeWidth="3.4" strokeLinecap="round" />
      {[[14, 28], [20, 32], [26, 22], [32, 24], [38, 16]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="2.4" fill="#2b2540" />)}
    </svg>),
  honest: () => (
    <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
      <path d="M24 6l15 6v10c0 10-6 17-15 20-9-3-15-10-15-20V12z" fill="#fff" stroke="#6b53b5" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M17 24l5 5 9-10" fill="none" stroke="#6b53b5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>),
};

// Each limit comes with a real example from the app (backend /trends, MERRA-2, GLDAS and IMERG, checked 2026-11-15).
const LIMITS = [
  { title: "A trend describes the past, not the future.",
    text: "Mekong Delta air temperature rose about +0.19 °C per decade from 2001 to 2025. That is how fast it changed, not a prediction. The separate Outlook page is experimental and shows how much skill it has." },
  { title: "It shows what changed, not why.",
    text: "A warming trend could come from many causes. Terra-scope measures the change; it does not test the cause." },
  { title: "\"Not proven yet\" does not mean \"no change\".",
    text: "Mekong Delta rainfall rose +3.43 mm/month per decade (2001 to 2024), but p = 0.077, so the test cannot confirm it yet. A longer record may." },
  { title: "Datasets can disagree.",
    text: "Over the Sahel, MERRA-2 shows cooling (−0.21 °C per decade) while GLDAS shows warming (+0.80). Both are models, not thermometers, so the app always names the dataset." },
] as const;

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const FEATURE_ICON: Record<string, () => JSX.Element> = {
  globe: Icon.globe, hunt: Icon.hunt, detective: Icon.detective, report: Icon.report,
  trend: () => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path {...S} d="M4 18l5-6 4 3 7-9" /><path {...S} d="M15 6h5v5" /></svg>,
  science: () => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path {...S} d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /><path {...S} d="M7.5 15h9" /></svg>,
};

/** Hero globe painted with REAL NASA data: MERRA-2 2 m air temperature trend 2001 to 2025 (seasonal Sen slope per decade,
 * from the backend trend grid, averaged into 3° squares and stored in assets/heroTrend.json so the landing page needs no
 * server). Drawn in the app's cute flat style: land is coloured by the trend in the team's map palette (orange = warming,
 * blue = cooling, one step paler when not significant after FDR), oceans are a flat pastel blue, the 3° squares are smoothed
 * into soft blobs for display only, and the sphere has a cartoon shine and shadow instead of realistic lighting. */
const HERO_PX = 460;                          // internal canvas size (CSS scales it)
const TEX_W = 720, TEX_H = 360;               // equirectangular texture, 0.5° per pixel
const HERO_UP = [[251, 224, 196], [242, 166, 90], [196, 98, 26]], HERO_DOWN = [[207, 225, 244], [127, 178, 229], [47, 111, 179]];
const HERO_FLAT = [253, 243, 228], HERO_SEA = [184, 222, 245];

/** Trend of the 3° block under a point (the same numbers the globe is painted with), or null when the block has no value. */
export function heroTrendAt(lon: number, lat: number): { slope: number; sig: boolean } | null {
  const d = heroTrend as { cell_deg: number; slope_x100: (number | null)[]; sig: string };
  const nx = 360 / d.cell_deg, ny = 180 / d.cell_deg;
  const col = Math.min(nx - 1, Math.max(0, Math.floor((lon + 180) / d.cell_deg)));
  const row = Math.min(ny - 1, Math.max(0, Math.floor((lat + 90) / d.cell_deg)));
  const v = d.slope_x100[row * nx + col];
  return v === null || v === undefined ? null : { slope: v / 100, sig: d.sig[row * nx + col] === "1" };
}

/** Flat colour texture (RGB per 0.5° pixel): posterised trend colour on land, pastel sea elsewhere. */
function buildTexture(): { tex: Uint8ClampedArray; land: Uint8Array } {
  const d = heroTrend as { cell_deg: number; slope_x100: (number | null)[]; sig: string };
  const nx = 360 / d.cell_deg, ny = 180 / d.cell_deg;
  // encode slope (R) and significance (G) so they can be smoothed together, then classify every texel
  const small = document.createElement("canvas"); small.width = nx; small.height = ny;
  const sctx = small.getContext("2d")!, img = sctx.createImageData(nx, ny);
  d.slope_x100.forEach((v, i) => {
    const o = ((ny - 1 - Math.floor(i / nx)) * nx + (i % nx)) * 4;      // data rows run south to north
    img.data[o] = Math.max(0, Math.min(255, 128 + (v ?? 0) / 100 * 160)); img.data[o + 1] = d.sig[i] === "1" ? 255 : 0; img.data[o + 3] = 255;
  });
  sctx.putImageData(img, 0, 0);
  const big = document.createElement("canvas"); big.width = TEX_W; big.height = TEX_H;
  const bctx = big.getContext("2d")!;
  bctx.imageSmoothingEnabled = true; bctx.imageSmoothingQuality = "high";
  bctx.drawImage(small, 0, 0, TEX_W, TEX_H);
  const enc = bctx.getImageData(0, 0, TEX_W, TEX_H).data;
  // land mask from Natural Earth (world-atlas), rasterised on the same grid
  const mask = document.createElement("canvas"); mask.width = TEX_W; mask.height = TEX_H;
  const mctx = mask.getContext("2d")!;
  const eq = geoEquirectangular().scale(TEX_W / (2 * Math.PI)).translate([TEX_W / 2, TEX_H / 2]);
  mctx.fillStyle = "#fff"; mctx.beginPath(); geoPath(eq, mctx)(land); mctx.fill();
  const m = mctx.getImageData(0, 0, TEX_W, TEX_H).data;
  const out = new Uint8ClampedArray(TEX_W * TEX_H * 3), isLand = new Uint8Array(TEX_W * TEX_H);
  for (let i = 0, j = 0; i < enc.length; i += 4, j += 3) {
    let c = HERO_SEA;
    if (m[i + 3] > 127) {
      isLand[i / 4] = 1;
      const slope = (enc[i] - 128) / 160, a = Math.abs(slope), sig = enc[i + 1] > 127;
      let k = a < 0.08 ? -1 : a < 0.25 ? 0 : a < 0.45 ? 1 : 2;
      if (!sig) k = Math.min(k, 0);
      c = k < 0 ? HERO_FLAT : (slope >= 0 ? HERO_UP : HERO_DOWN)[k];
    }
    out[j] = c[0]; out[j + 1] = c[1]; out[j + 2] = c[2];
  }
  return { tex: out, land: isLand };
}

type HeroTip = { x: number; y: number; lon: number; lat: number; land: boolean; trend: ReturnType<typeof heroTrendAt> };
const fmtCoord = (lon: number, lat: number) =>
  `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? "E" : "W"}`;

/** Interactive: drag to spin (with a little momentum) and tilt, hover or tap to read the trend under the pointer,
 * arrow keys rotate, double-click resets. Auto-spin pauses while the user is interacting and resumes after a few seconds. */
function HeroGlobe() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tip, setTip] = useState<HeroTip | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  useEffect(() => {
    const cv = ref.current, ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const { tex, land: landTex } = buildTexture();
    const S = HERO_PX, R = S / 2 - 10, TILT0 = 18;
    // per pixel on the disc: screen position on the unit sphere and a two-tone cartoon shade (fixed, light does not move)
    const idx: number[] = [], vx: number[] = [], vy: number[] = [], vz: number[] = [], lit: number[] = [];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const nx = (x + 0.5 - S / 2) / R, ny = -(y + 0.5 - S / 2) / R, rr = nx * nx + ny * ny;
      if (rr > 1) continue;
      idx.push((y * S + x) * 4); vx.push(nx); vy.push(ny); vz.push(Math.sqrt(1 - rr));
      // cel shading: a crescent on the lower right is one flat step darker
      const sx = nx - 0.16, sy = ny + 0.16;
      lit.push(sx * sx + sy * sy > 0.86 && nx - ny > -0.2 ? 0.88 : 1);
    }
    const n = idx.length, row = new Int32Array(n), off = new Float32Array(n);
    let tiltDone = NaN;
    // texture row and longitude offset depend only on the tilt, so they are recomputed only when the user tilts
    const setTilt = (deg: number) => {
      if (deg === tiltDone) return;
      tiltDone = deg;
      const T = deg * Math.PI / 180, sT = Math.sin(T), cT = Math.cos(T);
      for (let k = 0; k < n; k++) {
        const lat = Math.asin(vz[k] * sT + vy[k] * cT), lon = Math.atan2(vx[k], vz[k] * cT - vy[k] * sT);
        row[k] = Math.min(TEX_H - 1, Math.max(0, Math.floor((90 - lat * 180 / Math.PI) * 2)));
        off[k] = lon * 180 / Math.PI;
      }
    };
    const frame = ctx.createImageData(S, S), px = frame.data;
    const proj = geoOrthographic().scale(R).translate([S / 2, S / 2]).clipAngle(90).precision(0.6);
    const path = geoPath(proj, ctx);
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let centre = 100, tilt = TILT0, raf = 0, last = 0, spin = 0, resumeAt = 0, dirty = true;
    let drag: { id: number; x: number; y: number; t: number; moved: number } | null = null;
    const draw = () => {
      setTilt(Math.round(tilt * 2) / 2);
      ctx.clearRect(0, 0, S, S);
      for (let k = 0; k < n; k++) {
        let lon = centre + off[k];
        lon = ((lon + 180) % 360 + 360) % 360;
        const t = (row[k] * TEX_W + Math.min(TEX_W - 1, Math.floor(lon * 2))) * 3, o = idx[k], f = lit[k];
        px[o] = tex[t] * f; px[o + 1] = tex[t + 1] * f; px[o + 2] = tex[t + 2] * f; px[o + 3] = 255;
      }
      ctx.putImageData(frame, 0, 0);
      proj.rotate([-centre, -tiltDone]);
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath(); path(land); ctx.strokeStyle = "#2e2850"; ctx.lineWidth = 2.2; ctx.stroke();
      // cartoon shine: a soft white oval and a small dot on the upper left
      ctx.save(); ctx.translate(S * 0.33, S * 0.27); ctx.rotate(-0.6);
      ctx.beginPath(); ctx.ellipse(0, 0, S * 0.11, S * 0.05, 0, 0, 2 * Math.PI); ctx.fillStyle = "rgba(255, 255, 255, .55)"; ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(S * 0.22, S * 0.38, S * 0.018, 0, 2 * Math.PI); ctx.fillStyle = "rgba(255, 255, 255, .6)"; ctx.fill();
      // thick ink outline, like the rest of the illustrations
      ctx.beginPath(); ctx.arc(S / 2, S / 2, R, 0, 2 * Math.PI); ctx.strokeStyle = "#2e2850"; ctx.lineWidth = 9; ctx.stroke();
    };
    const tick = (t: number) => {
      const dt = last ? Math.min(64, t - last) : 0;
      last = t;
      if (!drag) {
        if (Math.abs(spin) > 0.002) { centre += spin * dt; spin *= Math.pow(0.94, dt / 16); dirty = true; }   // momentum after a fling
        else if (!still && t > resumeAt) { centre += dt * 0.006; dirty = true; }                          // about 6 degrees per second
      }
      if (dirty) { draw(); dirty = false; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // canvas pixel -> lon/lat with the current rotation (null outside the disc)
    const toCanvas = (e: { clientX: number; clientY: number }) => {
      const r = cv.getBoundingClientRect();
      return { cx: (e.clientX - r.left) / r.width * S, cy: (e.clientY - r.top) / r.height * S, r };
    };
    const where = (e: { clientX: number; clientY: number }) => {
      const { cx, cy, r } = toCanvas(e);
      if ((cx - S / 2) ** 2 + (cy - S / 2) ** 2 > R * R) return null;
      proj.rotate([-centre, -Math.round(tilt * 2) / 2]);      // current state, even if no frame has been drawn yet
      const ll = proj.invert?.([cx, cy]);
      if (!ll || !Number.isFinite(ll[0])) return null;
      const lon = ((ll[0] + 180) % 360 + 360) % 360 - 180, lat = ll[1];
      const ti = Math.min(TEX_H - 1, Math.max(0, Math.floor((90 - lat) * 2))) * TEX_W + Math.min(TEX_W - 1, Math.floor((lon + 180) * 2));
      return { x: e.clientX - r.left, y: e.clientY - r.top, lon, lat, land: landTex[ti] === 1, trend: heroTrendAt(lon, lat) };
    };
    const pause = (ms = 4000) => { resumeAt = performance.now() + ms; };
    const down = (e: PointerEvent) => {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
      spin = 0; pause(1e9); cv.setPointerCapture(e.pointerId); setGrabbing(true);
    };
    const move = (e: PointerEvent) => {
      if (drag && e.pointerId === drag.id) {
        const r = cv.getBoundingClientRect(), k = 180 / (r.width * 0.9);   // degrees per CSS pixel
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now();
        centre -= dx * k; tilt = Math.max(-60, Math.min(60, tilt + dy * k));
        spin = -dx * k / Math.max(8, now - drag.t);
        drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; drag.t = now; dirty = true;
        if (drag.moved > 6) setTip(null);
        return;
      }
      if (e.pointerType === "mouse") { const w = where(e); setTip(w); if (w) pause(); }
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const tap = drag.moved <= 6;
      if (performance.now() - drag.t > 80) spin = 0;     // released after holding still: no fling
      drag = null; setGrabbing(false); pause(tap ? 6000 : 3000);
      if (tap) setTip(where(e));                         // tap (touch) or click shows the reading
    };
    const leave = (e: PointerEvent) => { if (e.pointerType === "mouse" && !drag) { setTip(null); pause(1200); } };
    const key = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 30 : 10;
      if (e.key === "ArrowLeft") centre -= step; else if (e.key === "ArrowRight") centre += step;
      else if (e.key === "ArrowUp") tilt = Math.min(60, tilt + step); else if (e.key === "ArrowDown") tilt = Math.max(-60, tilt - step);
      else return;
      e.preventDefault(); spin = 0; pause(6000); dirty = true; setTip(null);
    };
    const reset = () => { centre = 100; tilt = TILT0; spin = 0; resumeAt = 0; dirty = true; setTip(null); };

    cv.addEventListener("pointerdown", down); cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("pointerleave", leave); cv.addEventListener("keydown", key); cv.addEventListener("dblclick", reset);
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up); cv.removeEventListener("pointercancel", up);
      cv.removeEventListener("pointerleave", leave); cv.removeEventListener("keydown", key); cv.removeEventListener("dblclick", reset);
    };
  }, []);

  const label = "Interactive globe showing real NASA data: MERRA-2 air temperature trend per decade, 2001 to 2025. Land is coloured by the trend: orange areas warmed, blue areas cooled; pale colours are not statistically significant. Drag or use the arrow keys to rotate; point at a place to read its trend.";
  const t = tip?.trend;
  return (
    <figure className="hero-globe" aria-label={label}>
      <div className="hero-globe-ball">
        <canvas ref={ref} width={HERO_PX} height={HERO_PX} role="img" aria-label={label} tabIndex={0}
          className={grabbing ? "grabbing" : undefined} />
        {tip && (
          <div className="hero-tip" role="status" style={{ left: tip.x, top: tip.y }}>
            <b className="num">{fmtCoord(tip.lon, tip.lat)}</b>
            {!tip.land ? <span>Ocean. This globe colours land only.</span>
              : !t ? <span>No data here.</span>
              : <>
                  <span className="num" style={{ color: t.slope >= 0 ? "var(--up-2)" : "var(--down-2)", fontWeight: 800 }}>
                    {t.slope >= 0 ? "+" : "−"}{Math.abs(t.slope).toFixed(2)} °C per decade</span>
                  <span>{t.slope >= 0 ? "Warmed" : "Cooled"}, 2001 to 2025 · {t.sig ? "clear trend" : "not proven yet"}</span>
                </>}
          </div>
        )}
      </div>
      <div className="hero-mascot"><Terra size={120} label="Terra, the Earth detective" /></div>
    </figure>
  );
}

function DemoVideoSection() {
  const v = DEMO_VIDEO;
  const playable = hasPlayableVideo(v);
  return (
    <section id="demo" className="lp-section lp-demo" aria-labelledby="demo-title">
      <div className="lp-head">
        <span className="lp-eyebrow">Product demo</span>
        <h2 id="demo-title" className="lp-h2">See Terra-scope in action</h2>
      </div>
      <div className="lp-video">
        {playable && v.kind === "file" && (
          <video controls preload="metadata" poster={v.poster} aria-label={v.title}>
            <source src={v.src} />
            {v.captions && <track kind="captions" src={v.captions} srcLang="en" label="English" default />}
          </video>
        )}
        {playable && (v.kind === "youtube" || v.kind === "drive") && (
          <iframe src={(v.kind === "youtube" ? youtubeEmbedUrl(v.id) : driveEmbedUrl(v.id))!} title={v.title} loading="lazy"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        )}
        {!playable && (
          <div className="lp-video-empty" role="status">
            <span className="lp-video-badge">Product Demo: Coming Soon</span>
            <Terra size={110} />
            <p>The demo video is being recorded.</p>
          </div>
        )}
      </div>
    </section>
  );
}

const NAV = [
  { id: "features", label: "Features" },
  { id: "how", label: "How it works" },
  { id: "data", label: "NASA data" },
  { id: "trust", label: "Trust" },
  { id: "demo", label: "Demo" },
] as const;

function jump(id: string) {
  const still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
}

/** Decorative page background: soft colour glows, faint latitude and longitude lines, and a few floating squares in the
 * trend colours (orange = warming, blue = cooling). Purely decorative, hidden from assistive technology. */
const BACKDROP_CELLS = [
  { x: 3, y: 14, s: 26, c: "#f2a65a", d: 0 }, { x: 6.5, y: 18, s: 16, c: "#fbe0c4", d: 2 }, { x: 2, y: 38, s: 18, c: "#7fb2e5", d: 4 },
  { x: 5, y: 62, s: 22, c: "#c4621a", d: 1 }, { x: 2.5, y: 84, s: 14, c: "#cfe1f4", d: 3 }, { x: 94, y: 10, s: 18, c: "#cfe1f4", d: 2 },
  { x: 96, y: 30, s: 24, c: "#7fb2e5", d: 0 }, { x: 92.5, y: 48, s: 14, c: "#f2a65a", d: 5 }, { x: 95.5, y: 70, s: 20, c: "#fbe0c4", d: 1 },
  { x: 93, y: 90, s: 26, c: "#2f6fb3", d: 3 },
];

function LandingBackdrop() {
  return (
    <div className="lp-backdrop" aria-hidden="true">
      <span className="lp-glow lp-glow-a" /><span className="lp-glow lp-glow-b" /><span className="lp-glow lp-glow-c" />
      <svg className="lp-grat" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        {[-3, -2, -1, 0, 1, 2, 3].map((k) => <ellipse key={`m${k}`} cx="600" cy="400" rx={Math.abs(k) * 150 || 2} ry="520" />)}
        {[-2, -1, 0, 1, 2].map((k) => <path key={`p${k}`} d={`M-50 ${400 + k * 150} Q600 ${400 + k * 150 + k * 40} 1250 ${400 + k * 150}`} />)}
      </svg>
      {BACKDROP_CELLS.map((c, i) => (
        <span key={i} className="lp-float" style={{ left: `${c.x}%`, top: `${c.y}%`, width: c.s, height: c.s, background: c.c, animationDelay: `${-c.d * 1.7}s` }} />
      ))}
    </div>
  );
}

export function Landing({ onStart }: { onStart: () => void }) {
  const watchDemo = () => jump("demo");
  return (
    <div className="landing">
      <LandingBackdrop />
      <header className="lp-header">
        <span className="brand"><Terra size={34} /> Terra-scope</span>
        <nav aria-label="Landing sections" className="lp-links">
          {NAV.map((n) => (
            <a key={n.id} href="#landing" onClick={(e) => { e.preventDefault(); jump(n.id); }}>{n.label}</a>
          ))}
        </nav>
        <ThemeToggle className="lp-theme" label={false} />
        <button type="button" className="btn" onClick={onStart}>Get Started</button>
      </header>

      <section className="lp-hero" aria-labelledby="lp-title">
        <div className="col" style={{ gap: 18 }}>
          <span className="lp-eyebrow">NASA Earth Observation · AI-Powered Exploration</span>
          <h1 id="lp-title" className="lp-h1">Discover Earth's Changing Story.</h1>
          <p className="lp-lead">Explore environmental trends using NASA Earth observation data, statistical analysis, and an AI-powered Earth System Detective.</p>
          <div className="row" style={{ gap: 12 }}>
            <button type="button" className="btn lp-cta" onClick={onStart}>Get Started</button>
            <button type="button" className="btn soft lp-cta" onClick={watchDemo}>Watch Demo</button>
            <a className="btn lp-cta lp-paper" href={RESEARCH_PAPER} target="_blank" rel="noreferrer"
              aria-label="Read the research paper (PDF, opens in a new tab)">
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2" />
              </svg>
              Read Research Paper
            </a>
          </div>
        </div>
        <HeroGlobe />
      </section>

      <section id="features" className="lp-section" aria-labelledby="features-title">
        <span className="lp-eyebrow">What you can do</span>
        <h2 id="features-title" className="lp-h2">Six ways to investigate a changing planet</h2>
        <div className="lp-feats">
          {FEATURES.map((f, i) => {
            const I = FEATURE_ICON[f.icon], Art = FEATURE_ART[f.icon];
            const Card = f.href ? "a" : "article";   // cards 1 to 5 open their feature directly
            return (
              <Card key={f.title} className={f.href ? "lp-feat lp-feat-link" : "lp-feat"} {...(f.href ? { href: f.href } : {})}>
                <div className="lp-feat-art" style={{ background: f.tint }}>
                  <span className="lp-feat-num" aria-hidden="true">{i + 1}</span>
                  <span className="lp-feat-tag">{f.tag}</span>
                  <Art />
                </div>
                <div className="lp-feat-body">
                  <h3><span className="lp-feat-icon"><I /></span>{f.title}</h3>
                  <p>{f.text}</p>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section id="how" className="lp-section" aria-labelledby="how-title">
        <span className="lp-eyebrow">How it works</span>
        <h2 id="how-title" className="lp-h2">Select, explore, analyse, explain</h2>
        <ol className="lp-steps">
          {STEPS.map((s, i) => {
            const Art = STEP_ART[s.art];
            return (
              <li key={s.title}>
                <div className="lp-step-art"><span className="lp-feat-num" aria-hidden="true">{i + 1}</span><Art /></div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            );
          })}
        </ol>
        <div className="lp-question">
          <div className="lp-q-ask">
            <span className="lp-eyebrow">Example question</span>
            <div className="lp-q-bubble">
              <p>"Is rainfall in the Mekong Delta really increasing, or could it be natural ups and downs?"</p>
            </div>
            {/* Real result from POST /trends: imerg_precip, preset mekong_delta, 2001-01 to 2024-12 (checked 2026-11-15).
                Re-check these numbers if the data or the method changes. */}
            <div className="lp-q-replyrow">
            <Terra size={52} />
            <div className="lp-q-reply">
              <span className="lp-eyebrow">Example answer <span className="lp-real">Real result</span></span>
              <ul className="lp-reply-list">
                <li><span className="lp-reply-icon" aria-hidden="true"><svg viewBox="0 0 32 32" width="24" height="24"><path d="M16 25V8M9 14l7-7 7 7" stroke="#c4621a" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></span><b>+3.43 mm/month per decade</b></li>
                <li><span className="lp-reply-icon lp-reply-p" aria-hidden="true">p</span><b>p = 0.077</b><span>(needs below 0.05)</span></li>
                <li className="lp-reply-verdict"><span>It could still be natural ups and downs.</span></li>
              </ul>
              <span className="lp-reply-src">NASA GPM IMERG, 2001 to 2024, 288 months</span>
            </div>
            </div>
          </div>
          <div className="lp-q-answer">
            <h3 id="q-answer-title">What every answer contains</h3>
            <ul className="lp-anatomy">
              <li>
                <span className="lp-anat-icon" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28"><path d="M9 22V10M4 15l5-5 5 5" stroke="#c4621a" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M23 10v12M18 17l5 5 5-5" stroke="#2f6fb3" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                <div><b>Rate of change per decade</b><span>How fast it rose or fell.</span></div>
              </li>
              <li>
                <span className="lp-anat-icon" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28"><path d="M4 26C10 26 11 6 16 6s6 20 12 20" fill="none" stroke="#7a7290" strokeWidth="2.4" /><path d="M23 22c2 2 3 4 5 4h-5z M9 22c-2 2-3 4-5 4h5z" fill="#e8735a" /></svg></span>
                <div><b>A significance test</b><span>Is it a real trend, or just chance?</span></div>
              </li>
              <li>
                <span className="lp-anat-icon" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28"><rect x="4" y="9" width="24" height="14" rx="7" fill="#d8ecff" /><path d="M10 16l3 3 6-6" stroke="#1d4f86" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
                <div><b>A plain verdict</b>
                  <span className="lp-verdicts">
                    <span className="badge sig">{VERDICT_TEXT.sig}</span>
                    <span className="badge np">{VERDICT_TEXT.np}</span>
                    <span className="badge ne">{VERDICT_TEXT.ne}</span>
                  </span></div>
              </li>
              <li>
                <span className="lp-anat-icon" aria-hidden="true"><svg viewBox="0 0 32 32" width="28" height="28"><path d="M8 4h11l5 5v19H8z" fill="#fff" stroke="#2b2540" strokeWidth="2.2" strokeLinejoin="round" /><path d="M12 15h8M12 20h8" stroke="#2b2540" strokeWidth="2.2" strokeLinecap="round" /></svg></span>
                <div><b>The evidence behind it</b><span>Dataset, place, years and method.</span></div>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section id="data" className="lp-section" aria-labelledby="data-title">
        <span className="lp-eyebrow">Data</span>
        <h2 id="data-title" className="lp-h2">Built on NASA Earth observation data</h2>
        <p className="lp-lead">Public NASA data from GES DISC, LP DAAC, NSIDC, OB.DAAC, JPL and FIRMS. Records that are not NASA are labelled: GPCC and CRU TS station grids as cross-checks.</p>
        <div className="lp-grid3">
          {SOURCES.map((s) => {
            const Art = SOURCE_ART[s.art];
            return (
              <article key={s.name} className="lp-src">
                <div className="lp-src-art" style={{ background: s.tint }}>
                  <span className="lp-feat-tag">{s.kind}</span>
                  <Art />
                </div>
                <div className="lp-src-body">
                  <h3>{s.name}</h3>
                  <p>{s.what}</p>
                  <ul className="lp-vars" aria-label={`Variables used from ${s.name}`}>
                    {s.vars.map((x) => <li key={x}>{x}</li>)}
                  </ul>
                  <a className="lp-src-link" href={s.url} target="_blank" rel="noreferrer">
                    {s.product} at {s.center}<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section id="trust" className="lp-section" aria-labelledby="trust-title">
        <span className="lp-eyebrow">Why you can trust a result</span>
        <h2 id="trust-title" className="lp-h2">Real data, real statistics, honest limits</h2>
        <div className="lp-grid3">
          {TRUST.map((t) => {
            const I = TRUST_ICON[t.icon];
            return (
              <article key={t.title} className="lp-pillar" style={{ background: t.tint }}>
                <span className="lp-pillar-icon"><I /></span>
                <h3>{t.title}</h3>
                <p>{t.text}</p>
              </article>
            );
          })}
        </div>
        <div className="lp-limits">
            <h3>What Terra-scope does not claim</h3>
            <ul className="lp-list">
              {LIMITS.map((l) => <li key={l.title}><b>{l.title}</b> {l.text}</li>)}
            </ul>
          </div>
      </section>

      <DemoVideoSection />

      <footer className="lp-footer">
        <div className="lp-footer-top">
          <span className="brand"><Terra size={28} /> Terra-scope AI</span>
          <nav aria-label="Footer" className="lp-footer-links">
            {NAV.map((n) => (
              <a key={n.id} href="#landing" onClick={(e) => { e.preventDefault(); jump(n.id); }}>{n.label}</a>
            ))}
          </nav>
        </div>
        <p className="small muted">Data: NASA GES DISC (GPM IMERG, GLDAS Noah, MERRA-2, MiCASA, GRACE-DA), LP DAAC (MODIS), NSIDC DAAC (SMAP), OB.DAAC (SeaWiFS), JPL (GRACE) and FIRMS; not NASA: GPCC (DWD), CRU TS (UEA). Terra-scope AI is not an official NASA product. Not affiliated with or endorsed by NASA.
          Built for NASA Space Apps Challenge 2026: "Be An Earth System Trend Detective!"</p>
      </footer>
    </div>
  );
}
