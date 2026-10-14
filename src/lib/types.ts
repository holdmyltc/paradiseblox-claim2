export type OrderStatus = "paid" | "in_progress" | "delivered" | "completed" | "cancelled";
export type StoreStatus = "online" | "busy" | "offline";

export type PublicOrderItem = {
  id: string;
  name: string;
  variantTitle: string | null;
  attributes: Array<{ key: string; value: string }>;
  quantity: number;
  game: string;
  imageUrl: string | null;
  sku?: string | null;
};

export type RobloxProfile = {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type PublicOrder = {
  id: string;
  orderNumber: string;
  emailMasked: string;
  totalAmount: string;
  currency: string;
  createdAt: string;
  status: OrderStatus;
  financialStatus: string;
  roblox: RobloxProfile | null;
  items: PublicOrderItem[];
  chatLocked: boolean;
  deliveredAt: string | null;
  completedAt: string | null;
  completedBy: "customer" | "admin" | null;
  storeStatus: StoreStatus;
  trustpilotUrl: string;
  unreadCount?: number;
  lastCustomerMessageAt?: string | null;
  claimRequestedAt?: string | null;
  email?: string;
};

export type ChatMessage = {
  id: string;
  sender: "customer" | "admin" | "system";
  body: string;
  createdAt: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
};

export type DeliveryProof = {
  id: string;
  note: string | null;
  createdAt: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
};
