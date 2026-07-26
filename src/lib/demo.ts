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
    { id:"1", name:"Hippo Golazo", variantTitle:"Cyber", attributes:[], quantity:1, game:"Steal a Brainrot", imageUrl:null },
    { id:"2", name:"Mega Seed", variantTitle:"Yin Yang", attributes:[], quantity:2, game:"Grow a Garden", imageUrl:null },
    { id:"3", name:"Icebreaker", variantTitle:null, attributes:[], quantity:1, game:"Murder Mystery 2", imageUrl:null },
  ],
  chatLocked:false,
  deliveredAt:null,
  completedAt:null,
  completedBy:null,
  storeStatus:"online",
  trustpilotUrl:"https://www.trustpilot.com/review/paradiseblox.com",
};

export const DEMO_MESSAGES: ChatMessage[] = [
  { id:"m1", sender:"system", body:"Your Order ID and Roblox account were verified.", createdAt:new Date(Date.now()-36*60000).toISOString(), attachmentUrl:null, attachmentName:null, attachmentMime:null },
  { id:"m2", sender:"admin", body:"Hey! I have your order. Please join Steal a Brainrot first and tell me when you are ready.", createdAt:new Date(Date.now()-31*60000).toISOString(), attachmentUrl:null, attachmentName:null, attachmentMime:null },
  { id:"m3", sender:"customer", body:"Hi, I am in SAB now.", createdAt:new Date(Date.now()-29*60000).toISOString(), attachmentUrl:null, attachmentName:null, attachmentMime:null },
  { id:"m4", sender:"admin", body:"Perfect. I am sending Hippo Golazo now. After this, we will do Grow a Garden and then MM2.", createdAt:new Date(Date.now()-28*60000).toISOString(), attachmentUrl:null, attachmentName:null, attachmentMime:null },
  { id:"m5", sender:"system", body:"ParadiseBlox is currently delivering your order.", createdAt:new Date(Date.now()-27*60000).toISOString(), attachmentUrl:null, attachmentName:null, attachmentMime:null },
];

export const DEMO_PROOFS: DeliveryProof[] = [];
