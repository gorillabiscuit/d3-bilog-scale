// Each loader returns: { points: [{x, y}], xLabel, yLabel, title, description }
// x is always the skewed variable (the one the adaptive scale operates on)
// y is a secondary variable for the scatterplot

export async function loadUSGS() {
  const url =
    'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson' +
    '&minmagnitude=1&limit=500&orderby=time';
  const res = await fetch(url);
  const json = await res.json();
  const points = json.features
    .map((f) => ({
      // Derive energy from magnitude so the outlier distortion is visible on a linear scale.
      // Energy ∝ 10^(1.5 * mag), normalised to mag-1 baseline so values start near 1.
      x: Math.pow(10, 1.5 * f.properties.mag) / Math.pow(10, 1.5),
      y: f.geometry.coordinates[2], // depth in km
    }))
    .filter((p) => p.x > 0 && Number.isFinite(p.y));
  return {
    points,
    xLabel: 'Seismic energy (relative, mag-1 = 1)',
    yLabel: 'Depth (km)',
    title: 'USGS Earthquakes',
    description: 'Recent earthquakes. A mag-7 releases ~1000× the energy of a mag-5.',
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
      return {
        x: price,
        y: sqft > 0 ? price / sqft : null,
      };
    })
    .filter((p) => p.x >= 1 && p.y !== null && Number.isFinite(p.x) && Number.isFinite(p.y));
  return {
    points,
    xLabel: 'Sale price (USD)',
    yLabel: 'Price per sq ft (USD)',
    title: 'NYC Property Sales',
    description: 'NYC rolling property sales. $0/$1 deed transfers sit far below residential prices; trophy deals far above.',
  };
}

export async function loadSBA() {
  // Local sample (600 rows) — the source CSV blocks CORS so we serve it from public/data/
  const res = await fetch('/data/sba-sample.csv');
  const text = await res.text();
  const rows = text.trim().split('\n');
  const headers = rows[0].split(',').map((h) => h.replace(/"/g, '').trim().toLowerCase());
  const grossIdx = headers.findIndex((h) => h === 'grossapproval');
  const termIdx = headers.findIndex((h) => h === 'terminmonths');
  const points = rows
    .slice(1, 601)
    .map((row) => {
      const cols = row.split(',');
      return {
        x: Number(cols[grossIdx]?.replace(/"/g, '')),
        y: Number(cols[termIdx]?.replace(/"/g, '')),
      };
    })
    .filter((p) => p.x > 0 && p.y > 0 && Number.isFinite(p.x) && Number.isFinite(p.y));
  return {
    points,
    xLabel: 'Loan amount (USD)',
    yLabel: 'Term in months',
    title: 'SBA 7(a) Loans',
    description: 'US Small Business Administration loans FY2020+. Most Express loans under $150K; max $5M.',
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
  // Local sample — figshare blocks programmatic downloads with a WAF challenge
  const res = await fetch('/data/forbes-sample.csv');
  const text = await res.text();
  const rows = text.trim().split('\n');
  // Headers: RANK,NAME,HEADQUARTERS,INDUSTRY,SALES,PROFIT,ASSETS,MARKET VALUE
  // Fields with commas inside are quoted — parse with a regex that respects quotes
  const points = rows
    .slice(1)
    .map((row) => {
      const cols = row.match(/(".*?"|[^,]+)/g) || [];
      return {
        x: parseForbesValue(cols[4]),
        y: parseForbesValue(cols[5]),
      };
    })
    .filter((p) => p.x > 0 && Number.isFinite(p.x) && Number.isFinite(p.y));
  return {
    points,
    xLabel: 'Revenue (USD)',
    yLabel: 'Profit (USD)',
    title: 'Forbes Global 2000',
    description: 'Top 2000 companies by revenue. Spans ~$500M (bottom) to $370B+ (Berkshire Hathaway).',
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
  }));
  return {
    points,
    xLabel: 'Citation count',
    yLabel: 'Publication year',
    title: 'OpenAlex Citations',
    description: 'Most-cited academic papers. The majority of all papers have <10 citations; top papers exceed 300,000.',
  };
}

export const LOADERS = {
  usgs: loadUSGS,
  nyc: loadNYC,
  sba: loadSBA,
  forbes: loadForbes,
  openalex: loadOpenAlex,
};
