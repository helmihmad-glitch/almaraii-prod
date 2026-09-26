import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Ban, Megaphone, MessageSquare, Menu, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { BRAND_LOGO_URL } from "@/lib/brand";
import { useSidebar } from "@/components/AppShell";

/** Modèles de message prêts à l'emploi : un clic remplace le contenu du message par ce squelette, à compléter avant l'envoi. */
const MESSAGE_TEMPLATES = [
  { label: "Info", icon: Megaphone, text: "📢 MARAI PROD - INFO\n - \nMerci" },
  { label: "Arrêt", icon: Ban, text: "⛔ MARAI PROD - ARRET\nMachine / processe : \nMotif : \nMerci d'intervenir" },
];

export default function SmsSend() {
  const { openSidebar } = useSidebar();
  const smsContactsQuery = trpc.settings.listSmsContacts.useQuery();
  const smsGroupsQuery = trpc.settings.listSmsGroups.useQuery();
  const [smsMessage, setSmsMessage] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  // Groupes (et « Tous ») dépliés : seuls leurs membres apparaissent dans la
  // liste de contacts à cocher, plutôt que la liste complète d'office.
  const [activeGroupIds, setActiveGroupIds] = useState<number[]>([]);
  const [allActive, setAllActive] = useState(false);

  const sendSms = trpc.sms.send.useMutation({
    onSuccess: (result) => {
      if (result.failed === 0) {
        toast.success(`SMS envoyé à ${result.sent} contact(s)`);
        setSmsMessage("");
        setSelectedContactIds([]);
        setActiveGroupIds([]);
        setAllActive(false);
      } else {
        const failedNames = result.results.filter((item) => !item.success).map((item) => item.name).join(", ");
        toast.warning(`${result.sent} envoyé(s), ${result.failed} échec(s)`, { description: `Échec pour : ${failedNames}` });
      }
    },
    onError: (error) => toast.error(error.message || "L’envoi du SMS a échoué."),
  });

  const contactIdsForGroups = (groupIds: number[]) => {
    const groups = smsGroupsQuery.data ?? [];
    const ids = new Set<number>();
    groupIds.forEach((groupId) => groups.find((group) => group.id === groupId)?.contactIds.forEach((id) => ids.add(id)));
    return Array.from(ids);
  };
  // Contacts réellement affichés (à cocher) : les membres des groupes dépliés,
  // ou tout le monde si « Tous » est actif — jamais la liste complète d'office.
  const visibleContactIds = useMemo(
    () => (allActive ? (smsContactsQuery.data ?? []).map((contact) => contact.id) : contactIdsForGroups(activeGroupIds)),
    [allActive, activeGroupIds, smsContactsQuery.data, smsGroupsQuery.data],
  );

  const toggleContact = (id: number) => setSelectedContactIds((previous) => (previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]));
  // Déplier/replier un groupe (ou « Tous ») recalcule d'un coup la sélection à
  // partir de la liste de membres qui devient visible — une désélection
  // individuelle faite avant de changer de groupe ne s'applique donc qu'à la
  // combinaison de groupes affichée à ce moment-là, pas au-delà.
  const toggleGroup = (groupId: number) => {
    const nextActiveGroupIds = activeGroupIds.includes(groupId) ? activeGroupIds.filter((id) => id !== groupId) : [...activeGroupIds, groupId];
    setActiveGroupIds(nextActiveGroupIds);
    setAllActive(false);
    setSelectedContactIds(contactIdsForGroups(nextActiveGroupIds));
  };
  const toggleAll = () => {
    const nextAllActive = !allActive;
    setAllActive(nextAllActive);
    setActiveGroupIds([]);
    setSelectedContactIds(nextAllActive ? (smsContactsQuery.data ?? []).map((contact) => contact.id) : []);
  };

  const submitSms = (event: React.FormEvent) => {
    event.preventDefault();
    if (selectedContactIds.length === 0) { toast.error("Choisissez au moins un contact ou un groupe."); return; }
    sendSms.mutate({ contactIds: selectedContactIds, message: smsMessage.trim() });
  };

  return (
    <main className="settings-screen">
      <header className="settings-topbar">
        <button className="mobile-menu" onClick={openSidebar} aria-label="Ouvrir le menu"><Menu size={20} /></button>
        <Link href="/" className="settings-back"><ArrowLeft size={16} />Retour au tableau de bord</Link>
        <div className="settings-brand"><div className="settings-brand-mark"><img src={BRAND_LOGO_URL} alt="Logo Almaraïi" /></div><span>Almaraïi <small>Production Pulse</small></span></div>
      </header>
      <section className="settings-page">
        <div className="settings-hero">
          <div><span className="settings-kicker"><MessageSquare size={14} />Diffusion rapide</span><h1>Envoi <em>SMS</em></h1>
          </div>
          <div className="settings-status"><Users size={18} /><div><strong>{smsContactsQuery.data?.length ?? 0} contact(s)</strong><span>{smsGroupsQuery.data?.length ?? 0} groupe(s)</span></div></div>
        </div>

        <div className="settings-grid reports-grid-single">
          <article className="settings-card sms-send-card">
            <div className="settings-card-heading"><div className="settings-icon"><MessageSquare size={19} /></div><div><span>Destinataires & message</span><h2>Envoyer un SMS</h2></div></div>
            <form className="password-form" onSubmit={submitSms}>
              <div>
                <span className="sms-picker-label">Groupes</span>
                <div className="sms-contact-picker" role="group" aria-label="Groupes">
                  <button type="button" className={`sms-group-chip ${allActive ? "sms-group-chip-active" : ""}`} onClick={toggleAll} disabled={!smsContactsQuery.data?.length}>
                    <Users size={13} />Tous<small>{smsContactsQuery.data?.length ?? 0}</small>
                  </button>
                  {smsGroupsQuery.isLoading ? <span className="settings-empty">Chargement des groupes…</span> : smsGroupsQuery.data?.length ? smsGroupsQuery.data.map((group) => (
                    <button type="button" key={group.id} className={`sms-group-chip ${activeGroupIds.includes(group.id) ? "sms-group-chip-active" : ""}`} onClick={() => toggleGroup(group.id)}>
                      <Users size={13} />{group.name}<small>{group.contactIds.length}</small>
                    </button>
                  )) : <span className="settings-empty">Aucun groupe configuré. Créez-en un dans Réglages.</span>}
                </div>
              </div>
              {visibleContactIds.length > 0 && (
                <div>
                  <span className="sms-picker-label">Contacts</span>
                  <div className="sms-contact-picker" role="group" aria-label="Destinataires">
                    {(smsContactsQuery.data ?? []).filter((contact) => visibleContactIds.includes(contact.id)).map((contact) => (
                      <label key={contact.id} className="sms-contact-option">
                        <input type="checkbox" checked={selectedContactIds.includes(contact.id)} onChange={() => toggleContact(contact.id)} />
                        <span>{contact.name}<small>{contact.phone}</small></span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <span className="sms-picker-label">Modèles de message</span>
                <div className="sms-contact-picker" role="group" aria-label="Modèles de message">
                  {MESSAGE_TEMPLATES.map((template) => (
                    <button type="button" key={template.label} className="sms-template-chip" onClick={() => setSmsMessage(template.text)}>
                      <template.icon size={13} />{template.label}
                    </button>
                  ))}
                </div>
              </div>
              <label>Message<textarea rows={5} value={smsMessage} onChange={(event) => setSmsMessage(event.target.value)} maxLength={480} placeholder="Ex. Le rapport de production du jour est disponible." required /></label>
              <button type="submit" className="settings-primary" disabled={sendSms.isPending || !smsContactsQuery.data?.length}><MessageSquare size={16} />{sendSms.isPending ? "Envoi…" : `Envoyer le SMS${selectedContactIds.length ? ` (${selectedContactIds.length})` : ""}`}</button>
            </form>
          </article>
        </div>
      </section>
    </main>
  );
}
