# Order page v2: setup and go live

Everything is on the `order-page-v2` branch. Your live site (`main`) is not touched until you merge.

**Important:** the preview uses your real database, Shopify store and email. Only test with your own order (a 100% discount code is the easiest way).

---

## Part 1. Test the preview (live site stays the same)

### 1. Run the database update

1. Supabase → your project → **SQL Editor** → **New query**.
2. Paste everything from `supabase/migrations/002_order_page_v2.sql`.
3. Click **Run**. You should see "Success. No rows returned".

This only adds new columns and tables. The old live site keeps working with it. It is safe to run twice.

### 2. Add the new settings in Vercel

Vercel → your project → **Settings** → **Environment Variables**. Add each one, ticking **Production** and **Preview**:

| Name | Value |
| --- | --- |
| `CRON_SECRET` | (I sent you this) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | (I sent you this) |
| `VAPID_PRIVATE_KEY` | (I sent you this) |
| `VAPID_SUBJECT` | `mailto:support@paradiseblox.com` |

Then **Deployments** → the newest `order-page-v2` deployment → **⋯** → **Redeploy**, so it picks the new settings up.

### 3. Open the preview

Vercel → **Deployments** → newest `order-page-v2` row → **Visit**. That link is your preview.

If Vercel asks you to log in to see it, that is normal. Vercel protects previews.

### 4. Test with your own order

1. Place an order on paradiseblox.com with a 100% discount code.
2. On the preview, open `/admin`, sign in, and check the order shows up.
3. On your phone, open the preview, enter the order number and email, link a Roblox account, and send a few screenshots in the chat (try pasting one too).
4. In admin: reply, tick an item, then **Mark delivered**.
5. On the customer page: tap **Received**. You should get the completion email.
6. In admin: download the evidence PDF.

During the preview, new-order emails and phone alerts still come from the old live site, and the risk check only runs once the new site is live. That is expected.

---

## Part 2. Go live

### 1. Merge

GitHub → the repo → **Pull requests** → the `order-page-v2` request → **Merge**. Vercel puts it live in about a minute.

To go back at any time: Vercel → **Deployments** → an older deployment → **⋯** → **Promote to Production**.

### 2. Add orders.paradiseblox.com

1. Vercel → **Settings** → **Domains** → add `orders.paradiseblox.com`.
2. Vercel shows a CNAME record. Add it where your domain's DNS is managed (Shopify → Settings → Domains → paradiseblox.com → DNS settings, if Shopify manages it). Name `orders`, value as Vercel shows.
3. Wait until Vercel shows a green tick.
4. Change `NEXT_PUBLIC_SITE_URL` in Vercel to `https://orders.paradiseblox.com`, then redeploy.

Keep `claim2.paradiseblox.com` added in Vercel too, so links in older emails still open.

### 3. Turn on the background jobs

1. Supabase → **SQL Editor** → **New query**.
2. Paste `supabase/go-live/01-scheduler.sql`, replace `PASTE_CRON_SECRET_HERE` with your `CRON_SECRET`, and **Run**.

This runs every 2 minutes: auto Received 24 hours after delivery, risk re-checks, "you have a new message" emails, and deleting screenshots older than 1 year.

### 4. Screenshots only

Supabase → **SQL Editor** → paste `supabase/go-live/02-screenshots-only.sql` → **Run**.

### 5. Point the store at the new address

Shopify → **Online Store** → **Themes** → **Customize** → **Theme settings** (the gear icon) → find **Claim order page** and set it to `https://orders.paradiseblox.com`, and **Claim page name shown to customers** to `orders.paradiseblox.com`. Save.

### 6. Turn on phone alerts

1. On your iPhone, open `https://orders.paradiseblox.com/admin` in Safari.
2. Share → **Add to Home Screen**.
3. Open it from the Home Screen icon, sign in, and tap **Phone alerts off** to turn it on. Allow notifications.

Do this from the Home Screen icon. iPhones only allow alerts from apps added to the Home Screen.

---

## How it works day to day

- **Online / Offline**: the switch at the top of admin. Offline shows customers "We're busier than usual". Online shows nothing extra.
- **Sound**: plays a chime for new orders and messages while admin is open.
- **High risk orders** go on hold. The customer is asked for a banking app screenshot of the charge, and the chat stays open. Approve to let delivery go ahead, or Cancel (then refund in Shopify).
- **Medium risk** is just an orange tag for you. Nothing changes for the customer.
- **Missing item**: tap ✕ on it, then refund that item in Shopify.
- **Chargeback**: open the order → **Download evidence PDF**, and upload it to Shopify's dispute page.
