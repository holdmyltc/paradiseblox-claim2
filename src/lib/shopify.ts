import { GAME_COLLECTIONS } from "@/lib/config";
import type { OrderStatus } from "@/lib/types";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-07";

type ShopifyOrderNode = {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  customer: { id: string; email: string | null } | null;
  lineItems: { nodes: Array<{
    id: string;
    name: string;
    title: string;
    variantTitle: string | null;
    customAttributes: Array<{ key: string; value: string | null }>;
    quantity: number;
    sku: string | null;
    image: { url: string; altText: string | null } | null;
    variant: { image: { url: string; altText: string | null } | null } | null;
    product: { id: string; title: string; handle: string; collections: { nodes: Array<{ handle: string; title: string }> } } | null;
  }> };
};

type CachedToken = { value: string; expiresAt: number };
let cachedToken: CachedToken | null = null;

function credentials() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const legacyToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!domain) throw new Error("SHOPIFY_STORE_DOMAIN is not configured");
  if (!legacyToken && (!clientId || !clientSecret)) {
    throw new Error("Shopify client credentials are not configured");
  }
  return { domain, clientId, clientSecret, legacyToken };
}

async function getAdminAccessToken() {
  const { domain, clientId, clientSecret, legacyToken } = credentials();

  // Compatibility for an older admin-created custom app. New Dev Dashboard apps
  // should use SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET instead.
  if (legacyToken) return legacyToken;

  if (cachedToken && cachedToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedToken.value;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId!,
    client_secret: clientSecret!,
  });
  const response = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = await response.json();
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Shopify token request failed");
  }

  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + Number(json.expires_in || 86399) * 1000,
  };
  return cachedToken.value;
}

export async function shopifyGraphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const { domain } = credentials();
  const token = await getAdminAccessToken();
  const response = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const json = await response.json();
  if (!response.ok || json.errors) throw new Error(json.errors?.[0]?.message || "Shopify request failed");
  return json.data as T;
}

const ORDER_FIELDS = `
  id name email createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus
  currentTotalPriceSet { shopMoney { amount currencyCode } }
  customer { id email }
  lineItems(first: 50) {
    nodes {
      id name title variantTitle quantity sku
      customAttributes { key value }
      image { url altText }
      variant { image { url altText } }
      product { id title handle collections(first: 10) { nodes { handle title } } }
    }
  }
`;

export async function findShopifyOrder(orderNumber: string) {
  const normalized = orderNumber.trim().startsWith("#") ? orderNumber.trim() : `#${orderNumber.trim()}`;
  const data = await shopifyGraphql<{ orders: { nodes: ShopifyOrderNode[] } }>(`
    query FindOrder($query: String!) { orders(first: 1, query: $query) { nodes { ${ORDER_FIELDS} } } }
  `, { query: `name:${JSON.stringify(normalized)}` });
  return data.orders.nodes[0] || null;
}

/** Light list of an email's order ids. Full details are fetched one order at a time,
 *  because asking for many full orders at once goes over Shopify's query cost limit. */
export async function listShopifyOrderIdsByEmail(email: string, limit = 50): Promise<string[]> {
  const data = await shopifyGraphql<{ orders: { nodes: Array<{ id: string }> } }>(`
    query ListOrderIds($query: String!, $first: Int!) { orders(first: $first, sortKey: CREATED_AT, reverse: true, query: $query) { nodes { id } } }
  `, { query: `email:${JSON.stringify(email.trim().toLowerCase())}`, first: limit });
  return data.orders.nodes.map((n) => n.id);
}

export async function getShopifyOrderById(id: string): Promise<ShopifyOrderNode | null> {
  const data = await shopifyGraphql<{ order: ShopifyOrderNode | null }>(`
    query OrderById($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }
  `, { id });
  return data.order;
}

/** Orders for this email that the site hasn't saved yet (up to `max`). */
export async function findShopifyOrdersByEmail(email: string, knownGids: Set<string> = new Set(), max = 15) {
  const ids = await listShopifyOrderIdsByEmail(email);
  const missing = ids.filter((id) => !knownGids.has(id)).slice(0, max);
  const nodes: ShopifyOrderNode[] = [];
  for (const id of missing) {
    const node = await getShopifyOrderById(id).catch((e) => { console.error("Shopify order fetch failed", id, e); return null; });
    if (node) nodes.push(node);
  }
  return nodes;
}

export function mapShopifyOrder(node: ShopifyOrderNode) {
  const items = node.lineItems.nodes.map((item) => {
    const collections = item.product?.collections.nodes || [];
    const game = collections.map((c) => GAME_COLLECTIONS[c.handle]).find(Boolean) || collections[0]?.title || "Other";
    const variantTitle = item.variantTitle && item.variantTitle !== "Default Title" ? item.variantTitle : null;
    const attributes = (item.customAttributes || [])
      .filter((attribute) => attribute.key && attribute.value)
      .map((attribute) => ({ key: attribute.key, value: String(attribute.value) }));
    return {
      shopifyLineItemId: item.id,
      name: item.title || item.product?.title || item.name,
      variantTitle,
      attributes,
      quantity: item.quantity,
      sku: item.sku,
      imageUrl: item.image?.url || item.variant?.image?.url || null,
      game,
    };
  });
  const status: OrderStatus = node.cancelledAt ? "cancelled" : node.displayFulfillmentStatus === "FULFILLED" ? "completed" : "paid";
  return {
    shopifyOrderGid: node.id,
    shopifyCustomerGid: node.customer?.id || null,
    orderNumber: node.name,
    email: (node.email || node.customer?.email || "").toLowerCase(),
    totalAmount: node.currentTotalPriceSet.shopMoney.amount,
    currency: node.currentTotalPriceSet.shopMoney.currencyCode,
    financialStatus: node.displayFinancialStatus,
    status,
    createdAt: node.createdAt,
    items,
  };
}

export async function subscribeShopifyCustomer(customerGid: string) {
  return shopifyGraphql<{
    customerEmailMarketingConsentUpdate: { userErrors: Array<{ message: string }>; customer: { id: string } | null };
  }>(`
    mutation Subscribe($input: CustomerEmailMarketingConsentUpdateInput!) {
      customerEmailMarketingConsentUpdate(input: $input) {
        customer { id }
        userErrors { field message }
      }
    }
  `, {
    input: {
      customerId: customerGid,
      emailMarketingConsent: {
        marketingState: "SUBSCRIBED",
        marketingOptInLevel: "SINGLE_OPT_IN",
        consentUpdatedAt: new Date().toISOString(),
      },
    },
  });
}
