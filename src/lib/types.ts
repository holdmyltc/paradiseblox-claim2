export type OrderStatus = "paid" | "in_progress" | "delivered" | "completed" | "cancelled";
/** "busy" is from the old version. It is treated exactly like "offline". */
export type StoreStatus = "online" | "offline" | "busy";
export type RiskLevel = "low" | "medium" | "high";
export type ItemDeliveryStatus = "pending" | "delivered" | "missing";

export type PublicOrderItem = {
  id: string;
  name: string;
  variantTitle: string | null;
  attributes: Array<{ key: string; value: string }>;
  quantity: number;
  game: string;
  imageUrl: string | null;
  sku?: string | null;
  deliveryStatus: ItemDeliveryStatus;
};

export type RobloxProfile = {
  userId: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type RiskInfo = {
  level: RiskLevel | null;
  reasons: string[];
  hold: boolean;
  decision: "approved" | "cancelled" | null;
  pending: boolean;
  checkoutIp?: string | null;
  billingCountry?: string | null;
  customerOrderCount?: number | null;
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
  receivedAt: string | null;
  completedAt: string | null;
  completedBy: "customer" | "admin" | "auto" | null;
  storeStatus: StoreStatus;
  trustpilotUrl: string;
  /** Customers only see whether the order is on hold. Admins see the full picture. */
  onHold: boolean;
  risk?: RiskInfo;
  unreadCount?: number;
  lastCustomerMessageAt?: string | null;
  claimRequestedAt?: string | null;
  email?: string;
};

export type ChatAttachment = {
  url: string | null;
  name: string;
  mime: string;
};

export type ChatMessage = {
  id: string;
  sender: "customer" | "admin" | "system";
  body: string;
  createdAt: string;
  attachments: ChatAttachment[];
  readByCustomerAt?: string | null;
  readByAdminAt?: string | null;
};

export type DeliveryProof = {
  id: string;
  note: string | null;
  createdAt: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
};

export type AuditEvent = {
  id: string;
  actor: "customer" | "admin" | "system";
  action: string;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  userAgent: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};
