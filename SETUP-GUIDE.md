# ParadiseBlox Claim 2 Setup Guide

This guide sets up the new project at `claim2.paradiseblox.com`. It does not touch the old claim website.

## What you need

Create or have access to:

1. GitHub account
2. Vercel account
3. New Supabase project
4. Shopify app for your ParadiseBlox store
5. Resend account for verification, claim-link and receipt emails
6. DNS access for `paradiseblox.com`
7. Node.js 20.9 or newer on your computer

## 1. Extract the project

Extract the downloaded ZIP. The folder you upload to GitHub is the folder containing:

```text
package.json
src/
public/
supabase/
scripts/
.env.example
```

Do not upload the ZIP file itself as the Vercel project root.

## 2. Test the design locally first

Open PowerShell in the project folder and run:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Keep this in `.env.local` for the design preview:

```env
NEXT_PUBLIC_DEMO_MODE=true
```

Open:

```text
http://localhost:3000/order/demo
```

This demo does not need Shopify, Supabase or email yet.

## 3. Create a brand-new Supabase project

1. Create a new Supabase project named something like `paradiseblox-claim2`.
2. Open the project.
3. Go to **SQL Editor**.
4. Open `supabase/schema.sql` from this project.
5. Copy the entire file into a new SQL query.
6. Click **Run**.
7. Confirm that the following tables exist in **Table Editor**:

```text
orders
order_items
messages
delivery_proofs
email_codes
store_settings
admin_profiles
request_events
email_receipts
webhook_events
```

The SQL also creates private Storage buckets for chat attachments and delivery proofs.

## 4. Copy Supabase settings

In Supabase, open the project's **Connect** dialog or **Settings > API Keys**.

Put these into `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx
```

Important:

- The publishable key is allowed in the browser.
- The secret key must only be stored in `.env.local` and Vercel Environment Variables.
- Never commit `.env.local` to GitHub.

## 5. Generate session secrets

Run this command twice in PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Use two different results:

```env
CUSTOMER_SESSION_SECRET=FIRST_RANDOM_VALUE
EMAIL_CODE_SECRET=SECOND_RANDOM_VALUE
```

## 6. Create the admin login

After Supabase variables are filled and `npm install` has finished, run:

```powershell
npm run admin:create -- your-admin-email@example.com "A-very-strong-password"
```

Use a password of at least 12 characters.

Later, sign in at:

```text
https://claim2.paradiseblox.com/admin
```

## 7. Create the Shopify app

### Recommended option: Shopify Dev Dashboard app

Use an app owned by your organisation and installed only on your own ParadiseBlox store.

Configure these Admin API scopes:

```text
read_orders
read_all_orders
read_products
read_customers
write_customers
```

Use:

```env
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_CLIENT_ID=your_client_id
SHOPIFY_CLIENT_SECRET=your_client_secret
SHOPIFY_API_VERSION=2026-07
SHOPIFY_WEBHOOK_SECRET=
```

When `SHOPIFY_WEBHOOK_SECRET` is blank, the app uses `SHOPIFY_CLIENT_SECRET` to verify Shopify webhook signatures.

### Existing Shopify Admin custom app option

If you already have a custom app with an Admin API access token, use:

```env
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_xxx
SHOPIFY_WEBHOOK_SECRET=YOUR_APP_API_SECRET_KEY
SHOPIFY_API_VERSION=2026-07
```

The webhook registration script supports either method.

## 8. Check game collection mappings

Open:

```text
src/lib/config.ts
```

The `GAME_COLLECTIONS` object maps Shopify collection handles to the game labels shown in Claim 2.

For example:

```ts
"steal-a-brainrot": "Steal a Brainrot",
"grow-a-garden": "Grow a Garden",
"murder-mystery-2": "Murder Mystery 2",
```

Make sure the handles match your real Shopify collection URLs. A collection URL ending in `/collections/grow-a-garden` has the handle `grow-a-garden`.

## 9. Set up Resend email

1. Create a Resend account.
2. Add a sending subdomain such as `mail.paradiseblox.com`.
3. Add the DNS records Resend gives you.
4. Wait until the domain is verified.
5. Create a Resend API key.

Add:

```env
RESEND_API_KEY=re_xxx
EMAIL_FROM=ParadiseBlox <orders@mail.paradiseblox.com>
```

The domain in `EMAIL_FROM` must match the domain or subdomain verified in Resend.

Emails sent by the project include:

- Secure claim link after payment
- Six-digit order-history verification code
- Completed delivery receipt with chat transcript PDF

## 10. Finish local environment settings

Your `.env.local` should look similar to this:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
NEXT_PUBLIC_DEMO_MODE=false

SUPABASE_SECRET_KEY=sb_secret_xxx
CUSTOMER_SESSION_SECRET=YOUR_FIRST_RANDOM_SECRET
EMAIL_CODE_SECRET=YOUR_SECOND_RANDOM_SECRET

SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_CLIENT_ID=YOUR_CLIENT_ID
SHOPIFY_CLIENT_SECRET=YOUR_CLIENT_SECRET
SHOPIFY_API_VERSION=2026-07
SHOPIFY_WEBHOOK_SECRET=

RESEND_API_KEY=re_xxx
EMAIL_FROM=ParadiseBlox <orders@mail.paradiseblox.com>

TRUSTPILOT_REVIEW_URL=https://www.trustpilot.com/review/paradiseblox.com
SUPPORT_URL=https://paradiseblox.com/pages/help-center
```

Use `SHOPIFY_ADMIN_ACCESS_TOKEN` instead of client credentials only when using the older custom-app method.

Restart `npm run dev` after changing `.env.local`.

## 11. Test a real order locally

A Shopify webhook cannot normally reach `localhost`, so first test manual verification:

1. Create a paid test order in Shopify.
2. Open `http://localhost:3000`.
3. Enter its order number and checkout email.
4. Confirm the items, quantities, variants, prices and date.
5. Verify a Roblox username.
6. Confirm the chat page opens.

The order item variant appears under the product name, such as `Cyber` or `Yin Yang`.

## 12. Create a private GitHub repository

Create a private repository named something like:

```text
paradiseblox-claim2
```

Do not initialize it with extra files if you plan to push using Git.

From PowerShell inside the project folder:

```powershell
git init
git add .
git commit -m "Initial ParadiseBlox Claim 2"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/paradiseblox-claim2.git
git push -u origin main
```

Check that `.env.local` was not uploaded. It is already listed in `.gitignore`.

## 13. Create a new Vercel project

1. In Vercel, click **Add New > Project**.
2. Import the new private GitHub repository.
3. Vercel should detect **Next.js** automatically.
4. Keep the root directory as the repository root.
5. Add every variable from `.env.example` under **Settings > Environment Variables**.
6. Set `NEXT_PUBLIC_DEMO_MODE=false`.
7. Initially set `NEXT_PUBLIC_SITE_URL` to the temporary Vercel deployment URL.
8. Deploy.

## 14. Add `claim2.paradiseblox.com`

1. Open the new Vercel project.
2. Go to **Settings > Domains**.
3. Add:

```text
claim2.paradiseblox.com
```

4. Vercel will display the exact CNAME record to add.
5. In the DNS provider for `paradiseblox.com`, add that CNAME record.
6. Do not delete or modify the DNS record used by the old claim site.
7. Wait for Vercel to show the domain as valid and HTTPS active.

Then change the Vercel environment variable to:

```env
NEXT_PUBLIC_SITE_URL=https://claim2.paradiseblox.com
```

Redeploy after changing it.

Also change the same value in your local `.env.local` before registering the webhook.

## 15. Register the Shopify paid-order webhook

After the production domain works, run locally:

```powershell
npm run shopify:webhook
```

It creates an `ORDERS_PAID` webhook pointing to:

```text
https://claim2.paradiseblox.com/api/shopify/webhooks/orders-paid
```

Running the command again is safe. It checks whether the same webhook already exists.

## 16. Production test

Use a low-value test order and check the full flow:

1. Payment completes in Shopify.
2. The order appears in Supabase.
3. The customer receives a secure Claim Your Order email.
4. The secure link opens the correct order without requesting order number or email.
5. Manual order number plus email verification also works.
6. Roblox username lookup and account confirmation work.
7. Customer and admin can chat.
8. Admin can change the store status to Online, Busy or Offline.
9. Admin uploads delivery proof.
10. Admin marks the order Delivered.
11. Customer confirms receipt, or admin completes it with a reason.
12. Chat becomes read-only.
13. Customer receives the final receipt and PDF chat transcript.
14. Trustpilot button opens the ParadiseBlox review page.

## 17. How to operate the website each day

### Admin

Open:

```text
https://claim2.paradiseblox.com/admin
```

Then:

1. Set ParadiseBlox to Online, Busy or Offline.
2. Open an order with an unread message.
3. Mark it In Progress.
4. Chat with the customer while delivering each game.
5. Upload proof after all items are delivered.
6. Mark it Delivered.
7. Wait for customer confirmation, or complete it manually with a reason.

### Customer

Customers can either:

- Open the secure claim email link, or
- Visit `claim2.paradiseblox.com` and enter order ID plus checkout email.

They only need an email code when they choose **Order history** to see all old and active orders connected to that email.

## 18. Safe launch method

Keep the old claim site live while testing Claim 2.

After the new system passes testing:

1. Update your Shopify order confirmation email or storefront Claim Order button to link to `https://claim2.paradiseblox.com`.
2. Keep the old website available temporarily as a fallback.
3. Do not delete the old Supabase project until you are certain no active customer still needs it.
