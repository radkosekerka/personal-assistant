/**
 * Jednorázově (a pak jednou za 12 měsíců): vytvoří software statement pro KB API.
 * Potřebuje kvalifikovaný certifikát pro elektronickou pečeť (I.CA nebo PostSignum) na firmu, která aplikaci provozuje,
 * a API klíč ke službě Client Registration z https://developers.kb.cz.
 *
 *   KB_CERT_P12=./pecet.p12 KB_CERT_PASSWORD=... KB_API_KEY_REGISTRATION=... \
 *   DASHBOARD_URL=https://dashboard.wakesurfnaklo.cz KB_CONTACT_EMAIL=radko@wakesurfnaklo.cz \
 *   npm run kb:statement
 *
 * Výsledný JWT ulož do KB_SOFTWARE_STATEMENT (Secret Manager). Certifikát nikam nenahrávej, aplikace ho za běhu nepotřebuje.
 */
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { request } from "node:https";

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Chybí ${k}`);
  return v;
};

const base = need("DASHBOARD_URL").replace(/\/$/, "");
const url = process.env.KB_REGISTRATION_URL || "https://client-registration.api-gateway.kb.cz/v3/software-statements";
const body = JSON.stringify({
  softwareName: process.env.KB_APP_NAME || "Náklo Dashboard",
  softwareNameEn: process.env.KB_APP_NAME || "Naklo Dashboard",
  softwareId: process.env.KB_SOFTWARE_ID || randomBytes(16).toString("hex"),
  softwareVersion: "1.0",
  softwareUri: base,
  redirectUris: [`${base}/api/bank/kb/callback`],
  tokenEndpointAuthMethod: "client_secret_post",
  grantTypes: ["authorization_code", "refresh_token"],
  responseTypes: ["code"],
  registrationBackUri: `${base}/api/bank/kb/registrace`,
  contacts: [`email: ${need("KB_CONTACT_EMAIL")}`],
  logoUri: `${base}/favicon.ico`,
  tosUri: base,
  policyUri: base,
});

const req = request(
  url,
  {
    method: "POST",
    pfx: readFileSync(need("KB_CERT_P12")),
    passphrase: need("KB_CERT_PASSWORD"),
    headers: {
      "Content-Type": "application/json",
      apiKey: need("KB_API_KEY_REGISTRATION"),
      "x-correlation-id": randomUUID(),
    },
  },
  (res) => {
    let data = "";
    res.on("data", (c) => (data += c));
    res.on("end", () => {
      if (res.statusCode !== 200 && res.statusCode !== 201) {
        console.error(`KB vrátila ${res.statusCode}: ${data}`);
        process.exit(1);
      }
      console.log("Software statement (ulož do KB_SOFTWARE_STATEMENT):\n");
      console.log(data.trim().replace(/^"|"$/g, ""));
    });
  },
);
req.on("error", (e) => {
  console.error(e);
  process.exit(1);
});
req.end(body);
