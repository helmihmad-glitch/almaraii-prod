import data from "../client/src/data/app-data.json" with { type: "json" };

for (const month of data.months) {
  const dates = month.daily.map((row) => row.date);
  const prefixes = [...new Set(dates.map((date) => date.slice(0, 7)))];
  console.log(JSON.stringify({ key: month.key, name: month.name, prefixes, firstDate: dates[0], lastDate: dates.at(-1), rowCount: dates.length }));
}
