import type { DeliveryProof, PublicOrder, PublicOrderItem } from "@/lib/types";

function groupedItems(order: PublicOrder) {
  return order.items.reduce<Record<string, PublicOrder["items"]>>((groups, item) => {
    (groups[item.game] ||= []).push(item); return groups;
  }, {});
}

function ItemDescription({ item }: { item: PublicOrderItem }) {
  return <div className="item-copy">
    <div className="item-name">{item.name}</div>
    {(item.variantTitle || item.attributes.length > 0) && <div className="item-options">
      {item.variantTitle && <span className="item-variant">{item.variantTitle}</span>}
      {item.attributes.map((attribute) => <span className="item-property" key={`${item.id}-${attribute.key}`}>{attribute.key}: {attribute.value}</span>)}
    </div>}
  </div>;
}

/**
 * Admin-side order panel. The Trustpilot review card was removed: it is
 * customer-facing copy and served no purpose in the operator's dashboard.
 * It still renders on the customer order page via .review-panel.
 */
export function OrderSidebar({ order, proofs = [] }: { order: PublicOrder; proofs?: DeliveryProof[] }) {
  return <aside className="sidebar">
    <section className="card side-card">
      <h3 className="side-title">Verified Roblox account</h3>
      {order.roblox ? <div className="roblox-card">
        {order.roblox.avatarUrl ? <img className="roblox-avatar" src={order.roblox.avatarUrl} alt="Roblox avatar" /> : <div className="roblox-avatar" />}
        <div><strong>{order.roblox.displayName}</strong><div className="small">@{order.roblox.username}</div><div className="small">User ID {order.roblox.userId}</div></div>
      </div> : <p className="section-copy">The customer has not linked a Roblox account yet.</p>}
    </section>
    <section className="card side-card">
      <h3 className="side-title">Items in this order</h3>
      {Object.entries(groupedItems(order)).map(([game, items]) => <div className="item-group" key={game}><div className="game-label">{game}</div>{items.map((item) => <div className="item-row" key={item.id}>{item.imageUrl ? <img className="item-image" src={item.imageUrl} alt="" /> : <div className="item-image" />}<ItemDescription item={item}/><div className="item-qty">x{item.quantity}</div></div>)}</div>)}
    </section>
    {proofs.length > 0 && <section className="card side-card"><h3 className="side-title">Delivery proof</h3><div className="proof-grid">{proofs.map((p) => p.mimeType.startsWith("image/") ? <a href={p.fileUrl} target="_blank" rel="noreferrer" key={p.id}><img className="proof-thumb" src={p.fileUrl} alt={p.note || "Delivery proof"}/></a> : <a className="btn btn-soft" href={p.fileUrl} target="_blank" rel="noreferrer" key={p.id}>Open proof</a>)}</div></section>}
  </aside>;
}
