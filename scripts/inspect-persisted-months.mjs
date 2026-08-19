const response = await fetch("http://localhost:3000/api/trpc/production.list?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D");
const rows = (await response.json())[0].result.data.json;
const totals = new Map();

for (const row of rows) {
  const key = row.productionDate.slice(0, 7);
  const current = totals.get(key) ?? { count: 0, production: 0, sources: new Map() };
  current.count += 1;
  current.production += Number(row.productionTons);
  current.sources.set(row.source, (current.sources.get(row.source) ?? 0) + 1);
  totals.set(key, current);
}

console.log(JSON.stringify(Object.fromEntries([...totals].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => [month, { ...value, sources: Object.fromEntries(value.sources) }])), null, 2));
