const domain = process.env.SHOPIFY_STORE_DOMAIN;
const clientId = process.env.SHOPIFY_CLIENT_ID;
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
const legacyToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const apiVersion = process.env.SHOPIFY_API_VERSION || "2026-07";
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

if (!domain || (!legacyToken && (!clientId || !clientSecret)) || !siteUrl) {
  console.error("Missing SHOPIFY_STORE_DOMAIN, Shopify credentials, or NEXT_PUBLIC_SITE_URL in .env.local");
  process.exit(1);
}

async function token() {
  if (legacyToken) return legacyToken;
  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const json = await response.json();
  if (!response.ok || !json.access_token) throw new Error(JSON.stringify(json));
  return json.access_token;
}

async function graphql(accessToken, query, variables = {}) {
  const response = await fetch(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json();
  if (!response.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  return json.data;
}

const uri = `${siteUrl}/api/shopify/webhooks/orders-paid`;
const accessToken = await token();
const existing = await graphql(accessToken, `
  query ExistingWebhooks {
    webhookSubscriptions(first: 100) {
      nodes { id topic uri }
    }
  }
`);

const match = existing.webhookSubscriptions.nodes.find(
  (item) => item.topic === "ORDERS_PAID" && item.uri === uri,
);

if (match) {
  console.log(`Webhook already registered: ${match.id}`);
  console.log(uri);
  process.exit(0);
}

const created = await graphql(accessToken, `
  mutation CreateOrdersPaidWebhook($topic: WebhookSubscriptionTopic!, $input: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $input) {
      webhookSubscription { id topic uri }
      userErrors { field message }
    }
  }
`, {
  topic: "ORDERS_PAID",
  input: { uri },
});

const result = created.webhookSubscriptionCreate;
if (result.userErrors?.length) {
  console.error(result.userErrors);
  process.exit(1);
}

console.log("Orders paid webhook registered successfully:");
console.log(result.webhookSubscription);
