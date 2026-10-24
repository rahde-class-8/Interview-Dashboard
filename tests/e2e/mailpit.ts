/** Reads Auth emails captured by the local Mailpit instance. */
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

interface MailpitMessage {
  ID: string;
  Subject: string;
}

export async function waitForEmailLink(to: string, subjectIncludes: string, pathPrefix: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages = [] } = (await res.json()) as { messages?: MailpitMessage[] };
    const match = messages.find((m) => m.Subject.includes(subjectIncludes));
    if (match) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${match.ID}`)).json()) as { HTML: string };
      const href = message.HTML.match(/href="([^"]+)"/g)
        ?.map((h) => h.slice(6, -1).replaceAll("&amp;", "&"))
        .find((h) => new URL(h).pathname.startsWith(pathPrefix));
      if (href) return href;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No "${subjectIncludes}" email with a ${pathPrefix} link for ${to}`);
}
