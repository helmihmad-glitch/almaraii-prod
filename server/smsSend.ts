// Envoi de SMS via TextBee (https://textbee.dev) : contrairement à un
// fournisseur cloud classique, TextBee ne route pas lui-même les SMS — il
// relaie la requête à un téléphone Android (avec l'appli TextBee + une SIM)
// qui envoie réellement le SMS via son réseau mobile. Voir
// https://textbee.dev/docs/sending-sms/sending-sms.
const TEXTBEE_SEND_ENDPOINT = "https://api.textbee.dev/api/v1/gateway/send-sms";

export type SmsSendResult = { phone: string; success: boolean; error?: string };

function extractErrorMessage(rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody);
    return parsed?.data?.message || parsed?.message || parsed?.error || rawBody;
  } catch {
    return rawBody;
  }
}

export async function sendSms(phone: string, content: string): Promise<SmsSendResult> {
  const apiKey = process.env.TEXTBEE_API_KEY;
  if (!apiKey) return { phone, success: false, error: "TEXTBEE_API_KEY n’est pas configurée sur le serveur." };

  try {
    const response = await fetch(TEXTBEE_SEND_ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ recipients: [phone], message: content }),
    });
    const rawBody = await response.text().catch(() => "");
    if (!response.ok) {
      return { phone, success: false, error: `TextBee a refusé l’envoi (${response.status}) : ${extractErrorMessage(rawBody).slice(0, 200)}` };
    }

    // Le téléphone-relais peut être hors ligne ou sa SIM indisponible : TextBee
    // répond alors 200 mais avec data.success: false plutôt qu'une erreur HTTP.
    let parsed: { data?: { success?: boolean; message?: string } } | undefined;
    try { parsed = JSON.parse(rawBody); } catch { parsed = undefined; }
    if (parsed?.data?.success === false) {
      return { phone, success: false, error: parsed.data.message || "Le téléphone relais TextBee n’a pas pu transmettre ce SMS (hors ligne ?)." };
    }
    return { phone, success: true };
  } catch (error) {
    return { phone, success: false, error: error instanceof Error ? error.message : "Erreur réseau lors de l’envoi." };
  }
}

export async function sendSmsToMany(phones: string[], content: string): Promise<SmsSendResult[]> {
  return Promise.all(phones.map((phone) => sendSms(phone, content)));
}
