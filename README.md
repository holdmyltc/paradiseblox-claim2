# ParadiseBlox Claim 2

A new and separate delivery portal for `claim2.paradiseblox.com`. It does not modify or reuse the old claim website.

## Main features

- Current order access using order ID and matching checkout email, without an email code
- Secure claim links sent after Shopify payment
- Six-digit email verification only for viewing all active and previous orders
- Optional Shopify email marketing subscription
- Roblox username, avatar, display name and permanent user ID confirmation
- One order chat for products across multiple Roblox games
- Shopify item variants and line-item properties shown under the product name
- Item count, order price and order date visible on desktop and mobile
- Verified Roblox account displayed beside the order number
- Store-wide Online, Busy and Offline controls
- Delivery proof uploads
- Customer or admin completion
- Read-only completed chat history
- PDF delivery receipt and chat transcript email
- Trustpilot review link
- Mobile-first layout and ParadiseBlox branding

## Start here

Read [SETUP-GUIDE.md](SETUP-GUIDE.md) for the complete step-by-step setup.

For a design-only local preview:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Keep `NEXT_PUBLIC_DEMO_MODE=true` and open:

```text
http://localhost:3000/order/demo
```

## Security

- Supabase secret keys and Shopify credentials stay server-side
- Customers access only verified orders through signed HTTP-only sessions
- Claim and receipt tokens are stored as hashes
- Verification codes expire after 10 minutes
- Storage buckets are private
- Admin endpoints require Supabase Auth and an `admin_profiles` record
- Shopify webhook signatures are verified and duplicate webhook IDs are ignored
- No public Supabase table policies are created
