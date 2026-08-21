const origin = "https://dashprod-fdptenze.manus.space";

async function callPublicProcedure(name, input, method = "POST") {
  const url = new URL(`/api/trpc/production.${name}`, origin);
  url.searchParams.set("batch", "1");
  const request = method === "GET"
    ? { method, headers: { Accept: "application/json" } }
    : { method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ 0: { json: input ?? null } }) };
  if (method === "GET") url.searchParams.set("input", JSON.stringify({ 0: { json: input ?? null } }));

  const response = await fetch(url, request);
  const payload = await response.json().catch(() => undefined);
  const envelope = Array.isArray(payload) ? payload[0] : payload;
  if (!response.ok || envelope?.error) throw new Error(`Échec public ${name}: ${JSON.stringify(envelope?.error ?? payload)}`);
  return envelope?.result?.data?.json;
}

const article = `TEST-PUBLIC-SUPPRESSION-${Date.now()}`;
let temporaryId;

try {
  const created = await callPublicProcedure("create", {
    productionDate: "2026-12-30",
    article,
    totalProductionHours: 1,
    plannedStopsHours: 0,
    unplannedStopsHours: 0,
    productionTons: 1,
    wasteTons: 0,
    standardRate: 1,
    comment: "Vérification temporaire publique",
  });
  temporaryId = created?.id;
  if (!temporaryId) throw new Error("La ligne temporaire publique n’a pas été créée.");

  await callPublicProcedure("delete", { id: temporaryId, actionPassword: "123456" });
  await callPublicProcedure("initialize", null);
  const records = await callPublicProcedure("list", null, "GET");
  if (records.some((record) => record.id === temporaryId || record.article === article)) {
    throw new Error("La ligne temporaire publique a réapparu après réinitialisation.");
  }

  console.log(JSON.stringify({ publicTemporaryRecordId: temporaryId, absentAfterPublicInitialize: true }));
} finally {
  if (temporaryId) {
    const records = await callPublicProcedure("list", null, "GET").catch(() => []);
    if (records.some((record) => record.id === temporaryId || record.article === article)) {
      await callPublicProcedure("delete", { id: temporaryId, actionPassword: "123456" }).catch(() => undefined);
    }
  }
}
