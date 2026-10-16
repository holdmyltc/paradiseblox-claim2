import type { ChatMessage, DeliveryProof, PublicOrder } from "@/lib/types";

export const DEMO_ORDER: PublicOrder = {
  id: "demo-order",
  orderNumber: "#4821",
  emailMasked: "ry****@example.com",
  totalAmount: "19.97",
  currency: "USD",
  createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  status: "in_progress",
  financialStatus: "PAID",
  roblox: { userId: 7281341, username: "zethlee", displayName: "Zeth", avatarUrl: "https://tr.rbxcdn.com/30DAY-AvatarHeadshot-2D50E778ECA04739CE649DDE68C34DFE-Png/420/420/AvatarHeadshot/Webp/noFilter" },
  items: [
    { id:"1", name:"Hippo Golazo", variantTitle:"Cyber", attributes:[], quantity:1, game:"Steal a Brainrot", imageUrl:null, deliveryStatus:"delivered" },
    { id:"2", name:"Mega Seed", variantTitle:"Yin Yang", attributes:[], quantity:2, game:"Grow a Garden", imageUrl:null, deliveryStatus:"pending" },
    { id:"3", name:"Icebreaker", variantTitle:null, attributes:[], quantity:1, game:"Murder Mystery 2", imageUrl:null, deliveryStatus:"pending" },
  ],
  chatLocked:false,
  deliveredAt:null,
  completedAt:null,
  completedBy:null,
  receivedAt:null,
  onHold:false,
  storeStatus:"online",
  trustpilotUrl:"https://au.trustpilot.com/review/paradiseblox.com",
};

export const DEMO_MESSAGES: ChatMessage[] = [
  { id:"m1", sender:"system", body:"Roblox account @zethlee was linked to this order.", createdAt:new Date(Date.now()-36*60000).toISOString(), attachments:[] },
  { id:"m2", sender:"admin", body:"Hey! Got your order. Join Steal a Brainrot and let me know when you're in.", createdAt:new Date(Date.now()-31*60000).toISOString(), attachments:[] },
  { id:"m3", sender:"customer", body:"im in now", createdAt:new Date(Date.now()-29*60000).toISOString(), attachments:[] },
  { id:"m4", sender:"admin", body:"Sending the trade for Hippo Golazo now. Grow a Garden and MM2 straight after.", createdAt:new Date(Date.now()-28*60000).toISOString(), attachments:[] },
  { id:"m5", sender:"system", body:"ParadiseBlox is delivering your order now.", createdAt:new Date(Date.now()-27*60000).toISOString(), attachments:[] },
];

export const DEMO_PROOFS: DeliveryProof[] = [];

/** Demo only: preview each state with /order/demo?state=link|delivered|completed|hold|offline */
export function demoOrder(state?: string): PublicOrder {
  const now = Date.now();
  switch (state) {
    case "link":
      return { ...DEMO_ORDER, roblox: null, status: "paid" };
    case "delivered":
      return { ...DEMO_ORDER, status: "delivered", deliveredAt: new Date(now - 5 * 60000).toISOString(), items: DEMO_ORDER.items.map((i) => ({ ...i, deliveryStatus: "delivered" as const })) };
    case "completed":
      return { ...DEMO_ORDER, status: "completed", chatLocked: true, deliveredAt: new Date(now - 30 * 60000).toISOString(), receivedAt: new Date(now - 20 * 60000).toISOString(), completedAt: new Date(now - 20 * 60000).toISOString(), completedBy: "customer", items: DEMO_ORDER.items.map((i) => ({ ...i, deliveryStatus: "delivered" as const })) };
    case "hold":
      return { ...DEMO_ORDER, status: "paid", onHold: true, items: DEMO_ORDER.items.map((i) => ({ ...i, deliveryStatus: "pending" as const })) };
    case "offline":
      return { ...DEMO_ORDER, storeStatus: "offline" };
    default:
      return DEMO_ORDER;
  }
}
