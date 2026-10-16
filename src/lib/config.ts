export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
export const TRUSTPILOT_URL = process.env.TRUSTPILOT_REVIEW_URL || "https://au.trustpilot.com/review/paradiseblox.com";
export const SUPPORT_URL = process.env.SUPPORT_URL || "https://paradiseblox.com/pages/help-center";
export const SESSION_COOKIE = "pb_claim2_session";

export const GAME_COLLECTIONS: Record<string, string> = {
  "steal-a-brainrot": "Steal a Brainrot",
  "op-brainrots": "Steal a Brainrot",
  "escape-tsunami-for-brainrots": "Escape Tsunami For Brainrots",
  "survive-lava-for-brainrots": "Survive Lava For Brainrots",
  "plants-vs-brainrots": "Plants Vs Brainrots",
  "grow-a-garden": "Grow a Garden",
  "grow-a-garden-2": "Grow a Garden 2",
  "murder-mystery-2": "Murder Mystery 2",
  "blox-fruits": "Blox Fruits",
  "ride-a-pet": "Ride A Pet",
  "steal-an-egg": "Steal An Egg",
  "adopt-me": "Adopt Me",
};

export const SUPPORT_EMAIL = process.env.REPLY_TO_EMAIL || "support@paradiseblox.com";
