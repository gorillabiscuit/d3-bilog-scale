import { csvParse } from 'd3-dsv';

// Each loader returns: { points: [{x, y, label, meta}], xLabel, yLabel, xFormat, yFormat,
//   title, description, noun }.
// x is the skewed variable the adaptive scale operates on; y is a secondary variable.
// label = the point's identity (shown first in the tooltip); meta = a short secondary line;
// noun = the plural the tooltip's percentile line reads ("bigger than 98% of <noun>").

const titleCase = (s) =>
  (s || '').toLowerCase().replace(/\b([a-z])/g, (_, c) => c.toUpperCase()).trim();

const joinMeta = (...parts) => parts.filter(Boolean).join(' · ');

export async function loadUSGS() {
  const url =
    'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson' +
    '&minmagnitude=1&limit=500&orderby=time';
  const res = await fetch(url);
  const json = await res.json();
  const points = json.features
    .map((f) => {
      const p = f.properties;
      return {
        // Derive energy from magnitude so the outlier distortion is visible on a linear scale.
        // Energy ∝ 10^(1.5 * mag), normalised to mag-1 baseline so values start near 1.
        x: Math.pow(10, 1.5 * p.mag) / Math.pow(10, 1.5),
        y: f.geometry.coordinates[2], // depth in km
        label: p.place || p.title || 'Unknown location',
        meta: joinMeta(
          Number.isFinite(p.mag) ? `M ${p.mag.toFixed(1)}` : null,
          p.type && p.type !== 'earthquake' ? p.type : null,
          p.tsunami ? 'tsunami' : null,
        ),
      };
    })
    .filter((p) => p.x > 0 && Number.isFinite(p.y));
  return {
    points,
    xLabel: 'Seismic energy (relative, mag-1 = 1)',
    yLabel: 'Depth (km)',
    xFormat: '~s',
    yFormat: '~s',
    title: 'USGS Earthquakes',
    description: 'Recent earthquakes. A mag-7 releases ~1000× the energy of a mag-5.',
    noun: 'quakes',
  };
}

export async function loadNYC() {
  // NYC Open Data Socrata API — rolling property sales, no auth required.
  // No ORDER BY — default insertion order gives a representative mix of cheap
  // deed transfers ($10) through trophy sales ($1B+), which is exactly the
  // two-sided distribution we want to demonstrate.
  const url =
    'https://data.cityofnewyork.us/resource/usep-8jbt.json' +
    '?$limit=800&$where=sale_price>0';
  const res = await fetch(url);
  const json = await res.json();
  const points = json
    .map((r) => {
      const price = Number(r.sale_price);
      const sqft  = Number(r.gross_square_feet);
      const hood  = titleCase(r.neighborhood);
      const type  = titleCase((r.building_class_category || '').replace(/^\d+\s+/, ''));
      return {
        x: price,
        y: sqft > 0 ? price / sqft : null,
        label: titleCase(r.address) || hood || 'NYC sale',
        meta: joinMeta(hood, type),
      };
    })
    .filter((p) => p.x >= 1 && p.y !== null && Number.isFinite(p.x) && Number.isFinite(p.y));
  return {
    points,
    xLabel: 'Sale price (USD)',
    yLabel: 'Price per sq ft (USD)',
    xFormat: 'currency',
    yFormat: 'currency',
    title: 'NYC Property Sales',
    description: 'NYC rolling property sales. $0/$1 deed transfers sit far below residential prices; trophy deals far above.',
    noun: 'sales',
  };
}

export async function loadSBA() {
  // Local sample — the source CSV blocks CORS so we serve it from public/data/.
  const res = await fetch('/data/sba-sample.csv');
  const text = await res.text();
  const points = csvParse(text)
    .slice(0, 600)
    .map((r) => ({
      x: Number(r.grossapproval),
      y: Number(r.terminmonths),
      label: r.borrname,
      meta: joinMeta(r.borrstate, (r.naicsdescription || '').trim()),
    }))
    .filter((p) => p.x > 0 && p.y > 0 && Number.isFinite(p.x) && Number.isFinite(p.y));
  return {
    points,
    xLabel: 'Loan amount (USD)',
    yLabel: 'Term (months)',
    xFormat: 'currency',
    yFormat: '~s',
    title: 'SBA 7(a) Loans',
    description: 'US Small Business Administration loans FY2020+. Most Express loans under $150K; max $5M.',
    noun: 'loans',
  };
}

// Parse "$285.11 B" or "$59 M" strings into a plain number in USD
function parseForbesValue(str) {
  if (!str) return NaN;
  const clean = str.replace(/"/g, '').replace(/\$/, '').replace(/,/g, '').trim();
  const multiplier = clean.endsWith('B') ? 1e9 : clean.endsWith('M') ? 1e6 : 1;
  return parseFloat(clean) * multiplier;
}

export async function loadForbes() {
  // Local sample — figshare blocks programmatic downloads with a WAF challenge.
  // Headers: RANK,NAME,HEADQUARTERS,INDUSTRY,SALES,PROFIT,ASSETS,MARKET VALUE
  const res = await fetch('/data/forbes-sample.csv');
  const text = await res.text();
  const points = csvParse(text)
    .map((r) => ({
      x: parseForbesValue(r.SALES),
      y: parseForbesValue(r.PROFIT),
      label: r.NAME,
      meta: joinMeta(r.INDUSTRY, r.HEADQUARTERS),
    }))
    .filter((p) => p.x > 0 && Number.isFinite(p.x) && Number.isFinite(p.y));
  return {
    points,
    xLabel: 'Revenue (USD)',
    yLabel: 'Profit (USD)',
    xFormat: 'currency',
    yFormat: 'currency',
    title: 'Forbes Global 2000',
    description: 'Top 2000 companies by revenue. Spans ~$500M (bottom) to $370B+ (Berkshire Hathaway).',
    noun: 'companies',
  };
}

export async function loadOpenAlex() {
  // OpenAlex REST API — top cited works, no auth (add email for polite pool)
  const url =
    'https://api.openalex.org/works?sort=cited_by_count:desc&per-page=200' +
    '&filter=type:article&mailto=wschreuders@gmail.com';
  const res = await fetch(url);
  const json = await res.json();
  const points = json.results.map((w) => ({
    x: w.cited_by_count,
    y: w.publication_year,
    label: w.display_name || w.title || 'Untitled',
    meta: joinMeta(
      w.authorships?.[0]?.author?.display_name,
      w.primary_location?.source?.display_name,
    ),
  }));
  return {
    points,
    xLabel: 'Citation count',
    yLabel: 'Publication year',
    xFormat: '~s',
    yFormat: 'd',
    title: 'OpenAlex Citations',
    description: 'Most-cited academic papers. The majority of all papers have <10 citations; top papers exceed 300,000.',
    noun: 'papers',
  };
}

export const LOADERS = {
  usgs: loadUSGS,
  nyc: loadNYC,
  sba: loadSBA,
  forbes: loadForbes,
  openalex: loadOpenAlex,
};
