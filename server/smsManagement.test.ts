import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

// Contacts et groupes SMS (Réglages) + page dédiée Envoi SMS : liste
// dynamique des destinataires (ajout/retrait, même modèle que
// production_operators), et sms.send qui résout les numéros côté serveur
// avant d'appeler TextBee (voir server/smsSend.ts — le SMS part réellement
// d'un téléphone Android relié au compte TextBee). TEXTBEE_API_KEY n'est
// jamais configurée en test : l'appel échoue donc systématiquement avec un
// message explicite, sans jamais atteindre le réseau — ce qui permet de
// tester tout le flux (gating, résolution des contacts, agrégation des
// résultats) sans mock HTTP.
function adminContext() {
  return { req: { protocol: "https", headers: {} }, res: { cookie: () => {}, clearCookie: () => {} }, user: null, isAdmin: true } as any;
}
function visitorContext() {
  return { req: { protocol: "https", headers: {} }, res: { cookie: () => {}, clearCookie: () => {} }, user: null, isAdmin: false } as any;
}

describe("Contacts SMS (Réglages)", () => {
  it("settings.addSmsContact refuse un visiteur, accepte un admin, et rejette un numéro qui n'est pas au format international", async () => {
    await expect(appRouter.createCaller(visitorContext()).settings.addSmsContact({ name: "Yosri", phone: "+21612345678" })).rejects.toThrow(/administrateur/i);

    const admin = appRouter.createCaller(adminContext());
    await expect(admin.settings.addSmsContact({ name: "Yosri", phone: "0612345678" })).rejects.toThrow();

    const created = await admin.settings.addSmsContact({ name: "Yosri", phone: "+21612345678" });
    expect(created).toMatchObject({ name: "Yosri", phone: "+21612345678" });

    const contacts = await admin.settings.listSmsContacts();
    expect(contacts.some((contact) => contact.phone === "+21612345678")).toBe(true);
  });

  it("settings.archiveSmsContact refuse un visiteur, accepte un admin, et retire le contact de la liste active", async () => {
    const admin = appRouter.createCaller(adminContext());
    const created = await admin.settings.addSmsContact({ name: "Contact à retirer", phone: "+21698765432" });

    await expect(appRouter.createCaller(visitorContext()).settings.archiveSmsContact({ id: created.id })).rejects.toThrow(/administrateur/i);

    await admin.settings.archiveSmsContact({ id: created.id });
    const contacts = await admin.settings.listSmsContacts();
    expect(contacts.some((contact) => contact.id === created.id)).toBe(false);
  });
});

describe("Groupes de contacts SMS (Réglages)", () => {
  it("settings.addSmsGroup refuse un visiteur, accepte un admin, et exige au moins un membre", async () => {
    const admin = appRouter.createCaller(adminContext());
    const contactA = await admin.settings.addSmsContact({ name: "Groupe A", phone: "+21611111111" });
    const contactB = await admin.settings.addSmsContact({ name: "Groupe B", phone: "+21622222222" });

    await expect(appRouter.createCaller(visitorContext()).settings.addSmsGroup({ name: "Équipe test", contactIds: [contactA.id] })).rejects.toThrow(/administrateur/i);
    await expect(admin.settings.addSmsGroup({ name: "Groupe vide", contactIds: [] })).rejects.toThrow();

    const group = await admin.settings.addSmsGroup({ name: "Équipe test", contactIds: [contactA.id, contactB.id] });
    expect(group).toMatchObject({ name: "Équipe test", contactIds: [contactA.id, contactB.id] });

    const groups = await admin.settings.listSmsGroups();
    expect(groups.some((item) => item.id === group.id)).toBe(true);
  });

  it("settings.updateSmsGroup change le nom et les membres d'un groupe existant", async () => {
    const admin = appRouter.createCaller(adminContext());
    const contactA = await admin.settings.addSmsContact({ name: "Membre A", phone: "+21633333333" });
    const contactB = await admin.settings.addSmsContact({ name: "Membre B", phone: "+21644444444" });
    const group = await admin.settings.addSmsGroup({ name: "Groupe initial", contactIds: [contactA.id] });

    await expect(appRouter.createCaller(visitorContext()).settings.updateSmsGroup({ id: group.id, name: "Groupe renommé", contactIds: [contactB.id] })).rejects.toThrow(/administrateur/i);

    const updated = await admin.settings.updateSmsGroup({ id: group.id, name: "Groupe renommé", contactIds: [contactA.id, contactB.id] });
    expect(updated).toMatchObject({ name: "Groupe renommé", contactIds: [contactA.id, contactB.id] });
  });

  it("settings.updateSmsGroup renvoie une erreur pour un id inconnu", async () => {
    const admin = appRouter.createCaller(adminContext());
    await expect(admin.settings.updateSmsGroup({ id: 987654321, name: "X", contactIds: [1] })).rejects.toThrow(/introuvable/i);
  });

  it("settings.archiveSmsGroup refuse un visiteur, accepte un admin, et retire le groupe de la liste active", async () => {
    const admin = appRouter.createCaller(adminContext());
    const contact = await admin.settings.addSmsContact({ name: "Membre C", phone: "+21655555555" });
    const group = await admin.settings.addSmsGroup({ name: "Groupe à retirer", contactIds: [contact.id] });

    await expect(appRouter.createCaller(visitorContext()).settings.archiveSmsGroup({ id: group.id })).rejects.toThrow(/administrateur/i);

    await admin.settings.archiveSmsGroup({ id: group.id });
    const groups = await admin.settings.listSmsGroups();
    expect(groups.some((item) => item.id === group.id)).toBe(false);
  });

  it("sms.send accepte les id résolus à partir des membres d'un groupe (choisir un groupe = envoyer à tous ses membres)", async () => {
    const admin = appRouter.createCaller(adminContext());
    const contactA = await admin.settings.addSmsContact({ name: "Groupe Envoi A", phone: "+21666666666" });
    const contactB = await admin.settings.addSmsContact({ name: "Groupe Envoi B", phone: "+21677777777" });
    const group = await admin.settings.addSmsGroup({ name: "Groupe Envoi", contactIds: [contactA.id, contactB.id] });

    const result = await admin.sms.send({ contactIds: group.contactIds, message: "Diffusion au groupe." });
    expect(result.results.map((item) => item.name).sort()).toEqual(["Groupe Envoi A", "Groupe Envoi B"]);
  });
});

describe("sms.send (page Envoi SMS)", () => {
  it("refuse un visiteur et exige au moins un contact et un message", async () => {
    const admin = appRouter.createCaller(adminContext());
    const contact = await admin.settings.addSmsContact({ name: "Destinataire", phone: "+21611112222" });

    await expect(appRouter.createCaller(visitorContext()).sms.send({ contactIds: [contact.id], message: "Test" })).rejects.toThrow(/administrateur/i);
    await expect(admin.sms.send({ contactIds: [], message: "Test" })).rejects.toThrow();
    await expect(admin.sms.send({ contactIds: [contact.id], message: "" })).rejects.toThrow();
  });

  it("résout les contacts choisis et remonte l'échec TextBee (TEXTBEE_API_KEY absente en test) plutôt que d'échouer silencieusement", async () => {
    const admin = appRouter.createCaller(adminContext());
    const contact = await admin.settings.addSmsContact({ name: "Destinataire SMS", phone: "+21633334444" });

    const result = await admin.sms.send({ contactIds: [contact.id], message: "Rapport de production disponible." });
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results).toEqual([{ phone: "+21633334444", success: false, error: expect.stringContaining("TEXTBEE_API_KEY"), name: "Destinataire SMS" }]);
  });

  it("renvoie une erreur si aucun des id fournis ne correspond à un contact existant", async () => {
    const admin = appRouter.createCaller(adminContext());
    await expect(admin.sms.send({ contactIds: [987654321], message: "Test" })).rejects.toThrow(/introuvable|contact/i);
  });
});
