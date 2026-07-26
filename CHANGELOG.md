# Claim 2 design update 5

- Rebuilt the claim homepage around the supplied premium responsive layout.
- Added a full-screen atmospheric background, animated glow, floating ParadiseBlox game tiles and an original PB portal graphic.
- Added light and dark themes with a persistent theme switch.
- Replaced the old hero and two-column information cards with one focused order-claim card.
- Added premium icon inputs, focus borders, button sheen, hover motion and mobile-safe spacing.
- Updated the public header used by order and history pages to the same design system.
- Added a web app manifest and mobile viewport settings.
- Preserved all existing Shopify verification, Supabase, chat, receipt and admin functionality.
- BuyBlox branding, mascot artwork and proprietary application code are not included.

# Claim 2 design update 2

This update keeps the old ParadiseBlox claim site untouched.

## Changes

- Shopify variant titles are now imported and shown under each product name.
- Shopify line item properties are stored and shown when present.
- Added `variant_title` and `custom_attributes` fields to `order_items`.
- Narrowed the customer order page to a premium 900px desktop container.
- Reworked desktop and mobile spacing using the supplied BuyBlox screenshots as the visual reference.
- Improved the order summary, Roblox account block, item cards, chat area and sticky composer.
- Added more polished shadows, hover states, status animation and message entry animation.
- Kept the exact system message: `Your Order ID and Roblox account were verified.`
- Customer-facing copy does not use long dash characters or marketplace seller wording.

## v4

- Shows item count, order price and purchase date on mobile as well as desktop.
- Moves the verified Roblox avatar, display name, username and user ID beside the order number.
- Removes the separate Roblox account block from the expanded order details.
- Changes the active delivery banner title to `Preparing Your Order`.
- Refines mobile order spacing, item rows, chat padding and message composer margins.
- Updates the Shopify webhook registration script to support either client credentials or an existing Admin API access token.
- Adds a complete step-by-step setup and operating guide.
