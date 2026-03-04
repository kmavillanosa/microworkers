import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { orderFramesAndPrice, orderPaymentLine, orderOutputSizeLabel } from "../helpers";
import { useAppStore } from "../stores/useAppStore";
import type { Order } from "../types";

const KANBAN_COLUMNS = [
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Accepted" },
  { id: "processing", label: "Processing" },
  { id: "ready_for_sending", label: "Ready for sending" },
  { id: "closed", label: "Closed" },
  { id: "declined", label: "Declined" },
];

/**
 * OrdersPage - Customer order management with Kanban board
 */
export function OrdersPage() {
  const navigate = useNavigate();
  const {
    orders,
    reels,
    orderPricing,
    orderClipTranscripts,
    orderUseClipAudio,
    orderUseClipAudioWithNarrator,
    processingOrders,
    orderDeletingId,
    ordersFilterStatus,
    ordersFilterPayment,
    ordersFilterReference,
    ordersFilterBank,
    ordersFilterDateStart,
    ordersFilterDateEnd,
    kanbanDropTarget,
    kanbanDragOrderId,
    setOrderUseClipAudio,
    setOrderUseClipAudioWithNarrator,
    setOrdersFilterStatus,
    setOrdersFilterPayment,
    setOrdersFilterReference,
    setOrdersFilterBank,
    setOrdersFilterDateStart,
    setOrdersFilterDateEnd,
    setKanbanDropTarget,
    setKanbanDragOrderId,
    handleSetOrderStatus,
    handleToggleOrderProcessing,
    handleDeleteOrder,
  } = useAppStore(useShallow((state) => ({
    orders: state.orders,
    reels: state.reels,
    orderPricing: state.orderPricing,
    orderClipTranscripts: state.orderClipTranscripts,
    orderUseClipAudio: state.orderUseClipAudio,
    orderUseClipAudioWithNarrator: state.orderUseClipAudioWithNarrator,
    processingOrders: state.processingOrders,
    orderDeletingId: state.orderDeletingId,
    ordersFilterStatus: state.ordersFilterStatus,
    ordersFilterPayment: state.ordersFilterPayment,
    ordersFilterReference: state.ordersFilterReference,
    ordersFilterBank: state.ordersFilterBank,
    ordersFilterDateStart: state.ordersFilterDateStart,
    ordersFilterDateEnd: state.ordersFilterDateEnd,
    kanbanDropTarget: state.kanbanDropTarget,
    kanbanDragOrderId: state.kanbanDragOrderId,
    setOrderUseClipAudio: state.setOrderUseClipAudio,
    setOrderUseClipAudioWithNarrator: state.setOrderUseClipAudioWithNarrator,
    setOrdersFilterStatus: state.setOrdersFilterStatus,
    setOrdersFilterPayment: state.setOrdersFilterPayment,
    setOrdersFilterReference: state.setOrdersFilterReference,
    setOrdersFilterBank: state.setOrdersFilterBank,
    setOrdersFilterDateStart: state.setOrdersFilterDateStart,
    setOrdersFilterDateEnd: state.setOrdersFilterDateEnd,
    setKanbanDropTarget: state.setKanbanDropTarget,
    setKanbanDragOrderId: state.setKanbanDragOrderId,
    handleSetOrderStatus: state.handleSetOrderStatus,
    handleToggleOrderProcessing: state.handleToggleOrderProcessing,
    handleDeleteOrder: state.handleDeleteOrder,
  })));

  const thisYear = new Date().getFullYear();
  const impersonateOrderUrl = (orderId: string) =>
    `https://reelagad.com/order?orderId=${encodeURIComponent(orderId)}&impersonate`;

  const filteredOrders = useMemo(() => {
    const ref = ordersFilterReference.trim().toLowerCase();
    return orders.filter((order) => {
      if (ordersFilterStatus && order.orderStatus !== ordersFilterStatus) return false;
      if (ordersFilterPayment && order.paymentStatus !== ordersFilterPayment) return false;
      if (ordersFilterBank && (order.bankCode ?? "") !== ordersFilterBank) return false;

      if (ref) {
        const refHaystack = `${order.id} ${order.paymentReference ?? ""} ${order.customerName} ${order.customerEmail}`
          .toLowerCase();
        if (!refHaystack.includes(ref)) return false;
      }

      const createdDate = new Date(order.createdAt).toISOString().slice(0, 10);
      if (ordersFilterDateStart && createdDate < ordersFilterDateStart) return false;
      if (ordersFilterDateEnd && createdDate > ordersFilterDateEnd) return false;
      return true;
    });
  }, [
    orders,
    ordersFilterStatus,
    ordersFilterPayment,
    ordersFilterReference,
    ordersFilterBank,
    ordersFilterDateStart,
    ordersFilterDateEnd,
  ]);

  const ordersByStatus = useMemo(() => {
    const grouped: Record<string, Order[]> = {
      pending: [],
      accepted: [],
      processing: [],
      ready_for_sending: [],
      closed: [],
      declined: [],
    };
    filteredOrders.forEach((order) => {
      const status = order.orderStatus ?? "pending";
      if (!grouped[status]) grouped[status] = [];
      grouped[status].push(order);
    });
    return grouped;
  }, [filteredOrders]);

  const ordersBreakdown = useMemo(() => {
    let amount = 0;
    filteredOrders.forEach((order) => {
      amount += orderFramesAndPrice(order.script, orderPricing, order).pricePesos;
    });
    return {
      total: {
        count: filteredOrders.length,
        amount,
      },
    };
  }, [filteredOrders, orderPricing]);

  return (
    <div className="outputs-page" style={{ padding: "var(--pad-md)" }}>
      <section className="panel output-panel">
        <h2>Order requests</h2>
        <p className="muted small">
          Customer orders from the order site. Click &quot;Open in
          Studio&quot; to load an order into the Control Room.
        </p>
        <div
          className="orders-filters"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--gap-sm)",
            alignItems: "center",
            marginBottom: "var(--pad-md)",
          }}
        >
          <label
            className="small"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            Status
            <select
              value={ordersFilterStatus}
              onChange={(e) => setOrdersFilterStatus(e.target.value)}
              style={{ padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
              <option value="processing">Processing</option>
              <option value="ready_for_sending">Ready for sending</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <label
            className="small"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            Payment
            <select
              value={ordersFilterPayment}
              onChange={(e) => setOrdersFilterPayment(e.target.value)}
              style={{ padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </label>
          <label
            className="small"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            Reference
            <input
              type="text"
              placeholder="Order ID or payment ref"
              value={ordersFilterReference}
              onChange={(e) => setOrdersFilterReference(e.target.value)}
              style={{
                padding: "0.35rem 0.6rem",
                fontSize: "0.85rem",
                minWidth: "140px",
              }}
            />
          </label>
          <label
            className="small"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            Bank
            <select
              value={ordersFilterBank}
              onChange={(e) => setOrdersFilterBank(e.target.value)}
              style={{ padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}
            >
              <option value="">All</option>
              <option value="BDO">BDO</option>
              <option value="BPI">BPI</option>
              <option value="GCASH">GCash</option>
            </select>
          </label>
          <label
            className="small"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            From
            <input
              type="date"
              value={ordersFilterDateStart}
              onChange={(e) =>
                setOrdersFilterDateStart(e.target.value)
              }
              style={{ padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}
            />
          </label>
          <label
            className="small"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            To
            <input
              type="date"
              value={ordersFilterDateEnd}
              onChange={(e) =>
                setOrdersFilterDateEnd(e.target.value)
              }
              style={{ padding: "0.35rem 0.6rem", fontSize: "0.85rem" }}
            />
          </label>
          {(ordersFilterStatus ||
            ordersFilterPayment ||
            ordersFilterReference.trim() ||
            ordersFilterBank ||
            ordersFilterDateStart !== `${thisYear}-01-01` ||
            ordersFilterDateEnd !== `${thisYear}-12-31`) && (
              <button
                type="button"
                className="btn-secondary small"
                onClick={() => {
                  setOrdersFilterStatus("");
                  setOrdersFilterPayment("");
                  setOrdersFilterReference("");
                  setOrdersFilterBank("");
                  setOrdersFilterDateStart(`${thisYear}-01-01`);
                  setOrdersFilterDateEnd(`${thisYear}-12-31`);
                }}
              >
                Clear filters
              </button>
            )}
        </div>
        <p className="small muted" style={{ marginBottom: "var(--pad-sm)" }}>
          {ordersFilterDateStart} → {ordersFilterDateEnd}
          {" · "}
          <strong>{ordersBreakdown.total.count} orders</strong>
          {" · "}
          ₱{ordersBreakdown.total.amount.toLocaleString()}
        </p>
        {orders.length === 0 ? (
          <p className="muted small">No orders yet.</p>
        ) : filteredOrders.length === 0 ? (
          <p className="muted small">
            No orders match the current filters.
          </p>
        ) : (
          <div className="orders-kanban">
            {KANBAN_COLUMNS.map((col) => (
              <div
                key={col.id}
                className={`orders-kanban-column${kanbanDropTarget === col.id ? " drop-target" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setKanbanDropTarget(col.id as any);
                }}
                onDragLeave={() => setKanbanDropTarget(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  const orderId = e.dataTransfer.getData("text/plain");
                  if (orderId) void handleSetOrderStatus(orderId, col.id as any);
                  setKanbanDropTarget(null);
                  setKanbanDragOrderId(null);
                }}
              >
                <div className="orders-kanban-column-head">
                  <span className="orders-kanban-column-title">{col.label}</span>
                  <span className="orders-kanban-column-count">{ordersByStatus[col.id].length}</span>
                </div>
                <div className="orders-kanban-column-cards">
                  {ordersByStatus[col.id].map((order) => {
                    const status = (order as Order).orderStatus ?? "pending";
                    const { frames, pricePesos } = orderFramesAndPrice(
                      order.script,
                      orderPricing,
                      order
                    );
                    const orderReels = reels.filter((r) => r.orderId === order.id);
                    const transcriptInfo = order.clipName ? orderClipTranscripts[order.clipName] : null;
                    const transcriptReady = transcriptInfo?.status === "completed";
                    const useClipAudio = orderUseClipAudio[order.id] ?? order.useClipAudio ?? false;
                    const useClipAudioWithNarrator =
                      orderUseClipAudioWithNarrator[order.id] ?? order.useClipAudioWithNarrator ?? false;
                    const clipAudioBlocked =
                      Boolean(order.clipName) &&
                      (useClipAudio || useClipAudioWithNarrator) &&
                      !transcriptReady;
                    const canAccept = status === "pending";
                    const canDecline = status === "pending" || status === "accepted";
                    const canMarkProcessing = status === "accepted" || status === "pending";
                    const canMarkReady = status === "processing";
                    const canClose = status === "ready_for_sending";
                    return (
                      <div
                        key={order.id}
                        className={`orders-kanban-card${kanbanDragOrderId === order.id ? " dragging" : ""}`}
                        draggable
                        onDragStart={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest("button, input, select, a[href]")) return;
                          e.dataTransfer.setData("text/plain", order.id);
                          e.dataTransfer.effectAllowed = "move";
                          setKanbanDragOrderId(order.id);
                        }}
                        onDragEnd={() => {
                          setKanbanDragOrderId(null);
                          setKanbanDropTarget(null);
                        }}
                      >
                        <div className="orders-kanban-card-body">
                          <div className="orders-kanban-card-header">
                            <span className="orders-kanban-card-customer-label">Customer</span>
                            <span className="order-status-badge" data-status={status}>
                              {status === "ready_for_sending" ? "Ready" : status}
                            </span>
                          </div>
                          <div className="orders-kanban-card-customer-info">
                            <span className="orders-kanban-card-customer-name">{order.customerName}</span>
                            <span className="orders-kanban-card-customer-email muted small">{order.customerEmail}</span>
                            {order.deliveryAddress?.trim() && (
                              <span className="orders-kanban-card-customer-delivery muted small">
                                Delivery: {order.deliveryAddress.trim()}
                              </span>
                            )}
                            <span className="orders-kanban-card-customer-size muted small">
                              Screen size: {orderOutputSizeLabel(order.outputSize)}
                            </span>
                          </div>
                          <p className="orders-kanban-card-summary">
                            {order.script.length > 45 ? `${order.script.slice(0, 45)}…` : order.script}
                            <span className="orders-kanban-card-price">{frames} frame{frames !== 1 ? "s" : ""} · ₱{pricePesos}</span>
                          </p>
                          <p className="orders-kanban-card-meta muted small">
                            {order.paymentStatus === "confirmed"
                              ? orderPaymentLine(order)
                              : "Payment pending"}
                            {order.clipName && (
                              <> · Transcript: {transcriptInfo?.status ?? "pending"}</>
                            )}
                            {orderReels.length > 0 && (
                              <> · {orderReels.length} video{orderReels.length !== 1 ? "s" : ""}</>
                            )}
                          </p>
                          {order.clipName && (
                            <div
                              className="orders-kanban-card-clip muted small"
                              role="group"
                              aria-label="Your video's sound"
                            >
                              <label className="orders-clip-audio-option">
                                <input
                                  type="radio"
                                  name={`clipAudio-${order.id}`}
                                  value=""
                                  checked={
                                    !useClipAudio &&
                                    !useClipAudioWithNarrator
                                  }
                                  onChange={() => {
                                    setOrderUseClipAudio((prev) => ({
                                      ...prev,
                                      [order.id]: false,
                                    }));
                                    setOrderUseClipAudioWithNarrator(
                                      (prev) => ({
                                        ...prev,
                                        [order.id]: false,
                                      }),
                                    );
                                  }}
                                />
                                <span>TTS narrator only (no clip audio)</span>
                              </label>
                              <label className="orders-clip-audio-option">
                                <input
                                  type="radio"
                                  name={`clipAudio-${order.id}`}
                                  value="no_narrator"
                                  checked={
                                    useClipAudio &&
                                    !useClipAudioWithNarrator
                                  }
                                  onChange={() => {
                                    setOrderUseClipAudio((prev) => ({
                                      ...prev,
                                      [order.id]: true,
                                    }));
                                    setOrderUseClipAudioWithNarrator(
                                      (prev) => ({
                                        ...prev,
                                        [order.id]: false,
                                      }),
                                    );
                                  }}
                                />
                                <span>Use clip audio (no narrator)</span>
                              </label>
                              <label className="orders-clip-audio-option">
                                <input
                                  type="radio"
                                  name={`clipAudio-${order.id}`}
                                  value="with_narrator"
                                  checked={useClipAudioWithNarrator}
                                  onChange={() => {
                                    setOrderUseClipAudio((prev) => ({
                                      ...prev,
                                      [order.id]: true,
                                    }));
                                    setOrderUseClipAudioWithNarrator(
                                      (prev) => ({
                                        ...prev,
                                        [order.id]: true,
                                      }),
                                    );
                                  }}
                                />
                                <span>Use clip audio and add a narrator</span>
                              </label>
                            </div>
                          )}
                        </div>
                        <div className="orders-kanban-card-actions">
                          <div className="orders-kanban-card-actions-row">
                            {orderReels.length > 0 && (
                              <button
                                type="button"
                                className="btn-secondary orders-kanban-btn"
                                onClick={() => navigate(`/orders/${order.id}/output`)}
                              >
                                View output{orderReels.length > 1 ? ` (${orderReels.length})` : ""}
                              </button>
                            )}
                            {(status === "pending" || processingOrders[order.id]) && (
                              <button
                                type="button"
                                className="orders-kanban-btn orders-kanban-btn-process"
                                onClick={() => void handleToggleOrderProcessing(order)}
                                disabled={clipAudioBlocked}
                              >
                                {processingOrders[order.id] ? "Cancel process" : "Process this video"}
                              </button>
                            )}
                            {clipAudioBlocked && (
                              <span className="muted small">Transcript not ready</span>
                            )}
                          </div>
                          <div className="orders-kanban-card-actions-row orders-kanban-approval">
                            {canAccept && (
                              <button
                                type="button"
                                className="btn-secondary orders-kanban-btn orders-kanban-btn-accept"
                                onClick={() => void handleSetOrderStatus(order.id, "accepted")}
                              >
                                Accept
                              </button>
                            )}
                            {canDecline && (
                              <button
                                type="button"
                                className="btn-secondary orders-kanban-btn orders-kanban-btn-decline"
                                onClick={() => void handleSetOrderStatus(order.id, "declined")}
                              >
                                Decline
                              </button>
                            )}
                            {canMarkProcessing && (
                              <button
                                type="button"
                                className="btn-secondary orders-kanban-btn"
                                onClick={() => void handleSetOrderStatus(order.id, "processing")}
                              >
                                Mark processing
                              </button>
                            )}
                            {canMarkReady && (
                              <button
                                type="button"
                                className="btn-secondary orders-kanban-btn"
                                onClick={() => void handleSetOrderStatus(order.id, "ready_for_sending")}
                              >
                                Mark ready to send
                              </button>
                            )}
                            {canClose && (
                              <button
                                type="button"
                                className="btn-secondary orders-kanban-btn"
                                onClick={() => void handleSetOrderStatus(order.id, "closed")}
                              >
                                Close
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            className="orders-kanban-btn orders-kanban-btn-studio"
                            onClick={() => navigate(`/?orderId=${order.id}`)}
                          >
                            Open in Studio
                          </button>
                          <button
                            type="button"
                            className="btn-secondary orders-kanban-btn"
                            onClick={() => {
                              window.location.assign(impersonateOrderUrl(order.id));
                            }}
                          >
                            Impersonate
                          </button>
                          <button
                            type="button"
                            className="ghost-btn small orders-kanban-btn orders-kanban-btn-delete"
                            onClick={() => void handleDeleteOrder(order.id)}
                            disabled={orderDeletingId === order.id}
                            title="Delete this order and its generated videos"
                          >
                            {orderDeletingId === order.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
