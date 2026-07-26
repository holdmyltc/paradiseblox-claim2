import type { DeliveryProof, PublicOrder, PublicOrderItem } from "@/lib/types";

function groupedItems(order: PublicOrder) {
  return order.items.reduce<Record<string, PublicOrder["items"]>>((groups, item) => {
    (groups[item.game] ||= []).push(item);
    return groups;
  }, {});
}

function statusContent(order: PublicOrder) {
  if (order.status === "completed") return { title:"Order Complete", copy:"Your delivery record and chat are saved below.", tone:"complete" };
  if (order.status === "delivered") return { title:"Your Order Was Marked Delivered", copy:"Check your items, then confirm when everything has arrived.", tone:"delivered" };
  if (order.status === "paid") return { title:"Order Ready", copy:"Link your Roblox account so ParadiseBlox can start your delivery.", tone:"ready" };
  return { title:"Preparing Your Order", copy:"Chat with us below while we prepare and deliver your items in-game.", tone:"active" };
}

function statusLabel(status: PublicOrder["status"]) {
  return status === "in_progress" ? "In progress" : status.charAt(0).toUpperCase() + status.slice(1);
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

export function OrderOverview({ order, proofs = [] }: { order: PublicOrder; proofs?: DeliveryProof[] }) {
  const groups = groupedItems(order);
  const status = statusContent(order);
  const gameCount = Object.keys(groups).length;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const price = new Intl.NumberFormat("en-US",{style:"currency",currency:order.currency}).format(Number(order.totalAmount));
  const date = new Date(order.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});

  return <>
    <section className={`delivery-banner delivery-banner-${status.tone}`}>
      <div className="delivery-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"/></svg></div>
      <div className="delivery-banner-copy">
        <strong>{status.title}</strong>
        <span>{status.copy}</span>
        <div className="delivery-badges">
          <span className="mini-badge"><i className={`store-dot store-dot-${order.storeStatus}`}/>{order.storeStatus === "online" ? "Online" : order.storeStatus === "busy" ? "Busy" : "Offline"}</span>
          <span className="mini-badge">{itemCount} item{itemCount === 1 ? "" : "s"}</span>
          <span className="mini-badge">{gameCount} game{gameCount === 1 ? "" : "s"}</span>
        </div>
      </div>
    </section>

    {/* NOT `open` — the reference ships this collapsed. An expanded summary on a
        390px phone eats ~350px, which is what starved the chat of height. */}
    <details className="order-summary">
      <summary className="order-summary-row">
        <div className="order-thumbnails" aria-hidden="true">
          {order.items.slice(0,2).map((item) => item.imageUrl ? <img key={item.id} src={item.imageUrl} alt=""/> : <span key={item.id} className="item-placeholder"/>)}
        </div>
        <div className="order-summary-copy">
          <div className="order-heading-block">
            <div className="order-summary-title">Order {order.orderNumber}</div>
            <div className="order-summary-meta" aria-label={`${itemCount} items, ${price}, ${date}`}>
              <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
              <span>{price}</span>
              <span>{date}</span>
            </div>
          </div>
        </div>
        <span className={`status-pill ${order.status === "in_progress" ? "status-progress" : `status-${order.status}`}`}>{statusLabel(order.status)}</span>
        <svg className="summary-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
      </summary>
      <div className="order-details-grid order-details-items-only">
        <section className="items-inline">
          <div className="detail-kicker">Items in this order</div>
          <div className="item-groups-inline">
            {Object.entries(groups).map(([game, items]) => <div className="item-group-inline" key={game}>
              <div className="game-label">{game}</div>
              {items.map((item) => <div className="item-row" key={item.id}>
                {item.imageUrl ? <img className="item-image" src={item.imageUrl} alt=""/> : <div className="item-image"/>}
                <ItemDescription item={item}/><div className="item-qty">x{item.quantity}</div>
              </div>)}
            </div>)}
          </div>
        </section>
        {proofs.length > 0 && <section className="proofs-inline">
          <div className="detail-kicker">Delivery proof</div>
          <div className="proof-grid">{proofs.map((proof) => proof.mimeType.startsWith("image/") ? <a href={proof.fileUrl} target="_blank" rel="noreferrer" key={proof.id}><img className="proof-thumb" src={proof.fileUrl} alt={proof.note || "Delivery proof"}/></a> : <a className="btn btn-soft" href={proof.fileUrl} target="_blank" rel="noreferrer" key={proof.id}>Open proof</a>)}</div>
        </section>}
      </div>
    </details>
  </>;
}
