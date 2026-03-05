import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { orderFramesAndPrice, orderPaymentLine, orderOutputSizeLabel } from "../helpers";
import { useAppStore } from "../stores/useAppStore";
import type { Order, OrderStatus } from "../types";

const KANBAN_COLUMNS: Array<{ id: OrderStatus; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Accepted" },
  { id: "processing", label: "Processing" },
  { id: "ready_for_sending", label: "Ready for sending" },
  { id: "closed", label: "Closed" },
  { id: "declined", label: "Declined" },
];

function createEmptyStatusSummary(): Record<OrderStatus, { count: number; amount: number }> {
  return {
    pending: { count: 0, amount: 0 },
    accepted: { count: 0, amount: 0 },
    processing: { count: 0, amount: 0 },
    ready_for_sending: { count: 0, amount: 0 },
    closed: { count: 0, amount: 0 },
    declined: { count: 0, amount: 0 },
  };
}

function orderDateInputValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatOrderCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatOrderStatusLabel(status: OrderStatus): string {
  if (status === "ready_for_sending") return "Ready";
  return status.replace(/_/g, " ");
}

function formatAudioModeLabel(mode: "clip_and_narrator" | "clip_only" | "tts_only"): string {
  if (mode === "clip_and_narrator") return "Clip + narrator";
  if (mode === "clip_only") return "Clip only";
  return "Narrator only";
}

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
  const defaultDateStart = `${thisYear}-01-01`;
  const defaultDateEnd = `${thisYear}-12-31`;
  const webOrdersBaseUrl = "https://reelagad.com";
  const impersonateOrderUrl = (orderId: string) =>
    `${webOrdersBaseUrl}/order?orderId=${encodeURIComponent(orderId)}&impersonate`;
  const orderReceiptUrl = (orderId: string) =>
    `${webOrdersBaseUrl}/receipt/${encodeURIComponent(orderId)}`;

  const filteredOrdersWithoutStatus = useMemo(() => {
    const ref = ordersFilterReference.trim().toLowerCase();
    return orders.filter((order) => {
      if (ordersFilterPayment && order.paymentStatus !== ordersFilterPayment) return false;
      if (ordersFilterBank && (order.bankCode ?? "") !== ordersFilterBank) return false;

      if (ref) {
        const refHaystack = `${order.id} ${order.paymentReference ?? ""} ${order.customerName} ${order.customerEmail}`
          .toLowerCase();
        if (!refHaystack.includes(ref)) return false;
      }

      const createdDate = orderDateInputValue(order.createdAt);
      if ((ordersFilterDateStart || ordersFilterDateEnd) && !createdDate) return false;
      if (ordersFilterDateStart && createdDate < ordersFilterDateStart) return false;
      if (ordersFilterDateEnd && createdDate > ordersFilterDateEnd) return false;
      return true;
    });
  }, [
    orders,
    ordersFilterPayment,
    ordersFilterReference,
    ordersFilterBank,
    ordersFilterDateStart,
    ordersFilterDateEnd,
  ]);

  const filteredOrders = useMemo(() => {
    if (!ordersFilterStatus) return filteredOrdersWithoutStatus;
    return filteredOrdersWithoutStatus.filter(
      (order) => (order.orderStatus ?? "pending") === ordersFilterStatus,
    );
  }, [filteredOrdersWithoutStatus, ordersFilterStatus]);

  const bankOptions = useMemo(() => {
    const codes = new Set<string>();
    orders.forEach((order) => {
      const bankCode = order.bankCode?.trim();
      if (bankCode) codes.add(bankCode);
    });
    return Array.from(codes).sort((left, right) => left.localeCompare(right));
  }, [orders]);

  const reelCountByOrderId = useMemo(() => {
    const counts: Record<string, number> = {};
    reels.forEach((reel) => {
      if (!reel.orderId) return;
      counts[reel.orderId] = (counts[reel.orderId] ?? 0) + 1;
    });
    return counts;
  }, [reels]);

  const statusSummary = useMemo(() => {
    const summary = createEmptyStatusSummary();
    filteredOrdersWithoutStatus.forEach((order) => {
      const status = (order.orderStatus ?? "pending") as OrderStatus;
      summary[status].count += 1;
      summary[status].amount += orderFramesAndPrice(order.script, orderPricing, order).pricePesos;
    });
    return summary;
  }, [filteredOrdersWithoutStatus, orderPricing]);

  const ordersByStatus = useMemo(() => {
    const grouped: Record<OrderStatus, Order[]> = {
      pending: [],
      accepted: [],
      processing: [],
      ready_for_sending: [],
      closed: [],
      declined: [],
    };
    filteredOrders.forEach((order) => {
      const status = (order.orderStatus ?? "pending") as OrderStatus;
      grouped[status].push(order);
    });
    (Object.keys(grouped) as OrderStatus[]).forEach((status) => {
      grouped[status].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      );
    });
    return grouped;
  }, [filteredOrders]);

  const kanbanColumnSummary = useMemo(() => {
    const summary = createEmptyStatusSummary();
    (Object.keys(ordersByStatus) as OrderStatus[]).forEach((status) => {
      const statusOrders = ordersByStatus[status];
      let amount = 0;
      statusOrders.forEach((order) => {
        amount += orderFramesAndPrice(order.script, orderPricing, order).pricePesos;
      });
      summary[status] = { count: statusOrders.length, amount };
    });
    return summary;
  }, [ordersByStatus, orderPricing]);

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

  const hasActiveFilters =
    Boolean(ordersFilterStatus) ||
    Boolean(ordersFilterPayment) ||
    Boolean(ordersFilterReference.trim()) ||
    Boolean(ordersFilterBank) ||
    ordersFilterDateStart !== defaultDateStart ||
    ordersFilterDateEnd !== defaultDateEnd;

  const clearFilters = () => {
    setOrdersFilterStatus("");
    setOrdersFilterPayment("");
    setOrdersFilterReference("");
    setOrdersFilterBank("");
    setOrdersFilterDateStart(defaultDateStart);
    setOrdersFilterDateEnd(defaultDateEnd);
  };

  return (
    <div className="outputs-page orders-page">
      <section className="panel output-panel">
        <div className="orders-page-header">
          <h2>Order requests</h2>
          <p className="muted small">
            Customer orders from the order site. Click &quot;Open in Studio&quot; to load an order into the
            Control Room.
          </p>
        </div>
        <div className="orders-toolbar">
          <div className="orders-filters">
            <label className="orders-filter-field orders-filter-search">
              <span className="orders-filter-label">Search</span>
              <input
                type="text"
                placeholder="Order ID, payment ref, customer name or email"
                value={ordersFilterReference}
                onChange={(e) => setOrdersFilterReference(e.target.value)}
              />
            </label>
            <label className="orders-filter-field">
              <span className="orders-filter-label">Status</span>
              <select
                value={ordersFilterStatus}
                onChange={(e) => setOrdersFilterStatus(e.target.value)}
              >
                <option value="">All</option>
                {KANBAN_COLUMNS.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="orders-filter-field">
              <span className="orders-filter-label">Payment</span>
              <select
                value={ordersFilterPayment}
                onChange={(e) => setOrdersFilterPayment(e.target.value)}
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
              </select>
            </label>
            <label className="orders-filter-field">
              <span className="orders-filter-label">Bank</span>
              <select
                value={ordersFilterBank}
                onChange={(e) => setOrdersFilterBank(e.target.value)}
              >
                <option value="">All</option>
                {bankOptions.map((bankCode) => (
                  <option key={bankCode} value={bankCode}>
                    {bankCode}
                  </option>
                ))}
              </select>
            </label>
            <label className="orders-filter-field">
              <span className="orders-filter-label">From</span>
              <input
                type="date"
                value={ordersFilterDateStart}
                onChange={(e) => setOrdersFilterDateStart(e.target.value)}
              />
            </label>
            <label className="orders-filter-field">
              <span className="orders-filter-label">To</span>
              <input
                type="date"
                value={ordersFilterDateEnd}
                onChange={(e) => setOrdersFilterDateEnd(e.target.value)}
              />
            </label>
          </div>
          <div className="orders-toolbar-meta">
            <p className="small muted">
              Showing {filteredOrders.length} of {filteredOrdersWithoutStatus.length} orders in this date range
            </p>
            <div className="orders-toolbar-actions">
              {hasActiveFilters && (
                <button
                  type="button"
                  className="btn-secondary small"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="orders-status-pills" role="tablist" aria-label="Quick status filters">
          <button
            type="button"
            className={`orders-status-pill${ordersFilterStatus === "" ? " active" : ""}`}
            onClick={() => setOrdersFilterStatus("")}
            title="Show all statuses"
          >
            <span>All</span>
            <span className="orders-status-pill-count">{filteredOrdersWithoutStatus.length}</span>
          </button>
          {KANBAN_COLUMNS.map((column) => (
            <button
              key={column.id}
              type="button"
              className={`orders-status-pill${ordersFilterStatus === column.id ? " active" : ""}`}
              onClick={() =>
                setOrdersFilterStatus(ordersFilterStatus === column.id ? "" : column.id)
              }
              title={`Filter ${column.label.toLowerCase()} orders`}
            >
              <span>{column.label}</span>
              <span className="orders-status-pill-count">{statusSummary[column.id].count}</span>
            </button>
          ))}
        </div>
        <div className="orders-summary-strip">
          <span className="orders-summary-item">
            <strong>{ordersBreakdown.total.count}</strong> order{ordersBreakdown.total.count !== 1 ? "s" : ""}
          </span>
          <span className="orders-summary-item">
            <strong>₱{ordersBreakdown.total.amount.toLocaleString()}</strong>
          </span>
          <span className="orders-summary-item">{ordersFilterDateStart} → {ordersFilterDateEnd}</span>
          <span className="orders-summary-item orders-summary-hint muted">
            Drag cards between columns to update status
          </span>
        </div>
        {orders.length === 0 ? (
          <p className="muted small">No orders yet.</p>
        ) : filteredOrders.length === 0 ? (
          <p className="muted small">
            No orders match the current filters.
          </p>
        ) : (
          <div className="orders-kanban-wrap">
            <div className="orders-kanban">
              {KANBAN_COLUMNS.map((col) => (
                <div
                  key={col.id}
                  className={`orders-kanban-column${kanbanDropTarget === col.id ? " drop-target" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setKanbanDropTarget(col.id);
                  }}
                  onDragLeave={() => setKanbanDropTarget(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const orderId = e.dataTransfer.getData("text/plain");
                    if (orderId) void handleSetOrderStatus(orderId, col.id);
                    setKanbanDropTarget(null);
                    setKanbanDragOrderId(null);
                  }}
                >
                  <div className="orders-kanban-column-head">
                    <div className="orders-kanban-column-head-left">
                      <span className="orders-kanban-column-title">{col.label}</span>
                      <span className="orders-kanban-column-count">{kanbanColumnSummary[col.id].count}</span>
                    </div>
                    <span className="orders-kanban-column-amount">
                      ₱{kanbanColumnSummary[col.id].amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="orders-kanban-column-cards">
                    {ordersByStatus[col.id].map((order) => {
                      const status = (order.orderStatus ?? "pending") as OrderStatus;
                      const { frames, pricePesos } = orderFramesAndPrice(
                        order.script,
                        orderPricing,
                        order,
                      );
                      const orderReelCount = reelCountByOrderId[order.id] ?? 0;
                      const transcriptInfo = order.clipName ? orderClipTranscripts[order.clipName] : null;
                      const transcriptReady = transcriptInfo?.status === "completed";
                      const useClipAudio = orderUseClipAudio[order.id] ?? order.useClipAudio ?? false;
                      const useClipAudioWithNarrator =
                        orderUseClipAudioWithNarrator[order.id] ?? order.useClipAudioWithNarrator ?? false;
                      const orderedAudioMode = order.useClipAudioWithNarrator
                        ? "clip_and_narrator"
                        : order.useClipAudio
                          ? "clip_only"
                          : "tts_only";
                      const orderedScriptPosition = order.scriptPosition ?? "bottom";
                      const orderedAnimationMode = order.scriptStyle?.animationMode ?? "normal";
                      const clipAudioBlocked =
                        Boolean(order.clipName) &&
                        (useClipAudio || useClipAudioWithNarrator) &&
                        !transcriptReady;
                      const canAccept = status === "pending";
                      const canDecline = status === "pending" || status === "accepted";
                      const canMarkProcessing = status === "accepted" || status === "pending";
                      const canMarkReady = status === "processing";
                      const canClose = status === "ready_for_sending";
                      const hasStatusActions =
                        canAccept || canDecline || canMarkProcessing || canMarkReady || canClose;
                      const hasPrimaryActions =
                        orderReelCount > 0 || status === "pending" || processingOrders[order.id] || clipAudioBlocked;
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
                              <div className="orders-kanban-card-order">
                                <span className="orders-kanban-card-order-id">Order {order.id.slice(0, 8)}</span>
                                <span className="orders-kanban-card-order-date muted small">
                                  {formatOrderCreatedAt(order.createdAt)}
                                </span>
                              </div>
                              <div className="orders-kanban-card-header-badges">
                                <span
                                  className={`orders-payment-badge${order.paymentStatus === "confirmed" ? " confirmed" : " pending"}`}
                                >
                                  {order.paymentStatus === "confirmed" ? "Paid" : "Payment pending"}
                                </span>
                                <span className="order-status-badge" data-status={status}>
                                  {formatOrderStatusLabel(status)}
                                </span>
                              </div>
                            </div>
                            <div className="orders-kanban-card-customer-info">
                              <span className="orders-kanban-card-customer-label">Customer</span>
                              <span className="orders-kanban-card-customer-name">{order.customerName}</span>
                              <span className="orders-kanban-card-customer-email muted small">{order.customerEmail}</span>
                              {order.deliveryAddress?.trim() && (
                                <span className="orders-kanban-card-customer-delivery muted small">
                                  Delivery: {order.deliveryAddress.trim()}
                                </span>
                              )}
                            </div>
                            <p className="orders-kanban-card-summary">
                              {order.script.length > 80 ? `${order.script.slice(0, 80)}…` : order.script}
                              <span className="orders-kanban-card-price">
                                {frames} frame{frames !== 1 ? "s" : ""} · ₱{pricePesos.toLocaleString()}
                              </span>
                            </p>
                            <div className="orders-kanban-card-tags">
                              <span className="orders-kanban-card-tag">Size: {orderOutputSizeLabel(order.outputSize)}</span>
                              <span className="orders-kanban-card-tag">Audio: {formatAudioModeLabel(orderedAudioMode)}</span>
                              <span className="orders-kanban-card-tag">Voice: {order.voiceName ?? "—"}</span>
                              <span className="orders-kanban-card-tag">Font: {order.fontId ?? "—"}</span>
                              <span className="orders-kanban-card-tag">Script: {orderedScriptPosition}</span>
                              <span className="orders-kanban-card-tag">Animation: {orderedAnimationMode}</span>
                              {order.clipName && <span className="orders-kanban-card-tag">Clip: {order.clipName}</span>}
                              {orderReelCount > 0 && (
                                <span className="orders-kanban-card-tag">
                                  {orderReelCount} output{orderReelCount !== 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                            <div className="orders-kanban-card-meta-grid">
                              <span className="orders-kanban-card-meta-item">
                                <strong>Payment:</strong>{" "}
                                {order.paymentStatus === "confirmed" ? orderPaymentLine(order) : "Payment pending"}
                              </span>
                              <span className="orders-kanban-card-meta-item">
                                <strong>Payment session:</strong> {order.paymentSessionId ?? "—"}
                              </span>
                              {order.clipName && (
                                <span className="orders-kanban-card-meta-item">
                                  <strong>Transcript:</strong> {transcriptInfo?.status ?? "pending"}
                                </span>
                              )}
                            </div>
                            {order.clipName && (
                              <div
                                className="orders-kanban-card-clip muted small"
                                role="group"
                                aria-label="Your video's sound"
                              >
                                <p className="orders-kanban-card-clip-title">Audio mode override</p>
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
                            <button
                              type="button"
                              className="orders-kanban-btn orders-kanban-btn-studio"
                              onClick={() => navigate(`/?orderId=${order.id}`)}
                            >
                              Open in Studio
                            </button>
                            {hasPrimaryActions && (
                              <div className="orders-kanban-card-actions-row orders-kanban-card-actions-primary">
                                {orderReelCount > 0 && (
                                  <button
                                    type="button"
                                    className="btn-secondary orders-kanban-btn"
                                    onClick={() => navigate(`/orders/${order.id}/output`)}
                                  >
                                    View output{orderReelCount > 1 ? ` (${orderReelCount})` : ""}
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
                            )}
                            {hasStatusActions && (
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
                            )}
                            <div className="orders-kanban-card-actions-row orders-kanban-card-actions-footer">
                              <button
                                type="button"
                                className="btn-secondary orders-kanban-btn"
                                onClick={() => {
                                  window.open(
                                    impersonateOrderUrl(order.id),
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                                }}
                              >
                                Impersonate
                              </button>
                              <button
                                type="button"
                                className="btn-secondary orders-kanban-btn"
                                onClick={() => {
                                  window.open(
                                    orderReceiptUrl(order.id),
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                                }}
                              >
                                Open receipt
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
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
