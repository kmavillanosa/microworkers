import { useParams } from "react-router-dom";
import type { Order, ReelItem } from "../types";

/**
 * OrderOutputPage - Display generated reels for a customer order
 */
export function OrderOutputPage({
    orders,
    reels,
    navigate,
    apiBaseUrl,
    apiVpsBaseUrl,
    onDeleteOrder,
    orderDeletingId,
}: {
    orders: Order[];
    reels: ReelItem[];
    navigate: (path: string) => void;
    apiBaseUrl: string;
    apiVpsBaseUrl: string;
    onDeleteOrder?: (orderId: string) => Promise<void>;
    orderDeletingId?: string | null;
}) {
    const { orderId } = useParams<{ orderId: string }>();
    const order = orders.find((o) => o.id === orderId);
    const orderReels = reels.filter((r) => r.orderId === orderId);
    const mediaBase = apiVpsBaseUrl || apiBaseUrl;

    if (!orderId) {
        return (
            <div className="outputs-page" style={{ padding: "var(--pad-md)" }}>
                <p className="muted">Missing order ID.</p>
                <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => navigate("/orders")}
                >
                    Back to orders
                </button>
            </div>
        );
    }
    if (!order) {
        return (
            <div className="outputs-page" style={{ padding: "var(--pad-md)" }}>
                <p className="muted">Order not found.</p>
                <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => navigate("/orders")}
                >
                    Back to orders
                </button>
            </div>
        );
    }

    async function handleDeleteOrder() {
        if (!orderId || !onDeleteOrder) return;
        if (
            !window.confirm(
                "Permanently delete this order and all its generated videos? This cannot be undone."
            )
        ) {
            return;
        }
        try {
            await onDeleteOrder(orderId);
        } catch (e) {
            console.error(e);
            window.alert("Failed to delete order. See console.");
        }
    }

    return (
        <div className="outputs-page" style={{ padding: "var(--pad-md)" }}>
            <section className="panel output-panel">
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--gap-sm)",
                        marginBottom: "var(--pad-md)",
                        flexWrap: "wrap",
                    }}
                >
                    <button
                        type="button"
                        className="btn-secondary small"
                        onClick={() => navigate("/orders")}
                    >
                        ← Back to orders
                    </button>
                    {onDeleteOrder && (
                        <button
                            type="button"
                            className="ghost-btn small"
                            onClick={() => void handleDeleteOrder()}
                            disabled={orderDeletingId === orderId}
                            title="Delete this order and its generated videos"
                        >
                            {orderDeletingId === orderId ? "Deleting…" : "Delete order"}
                        </button>
                    )}
                </div>
                <h2>Output for order</h2>
                <p className="muted small">
                    <strong>{order.customerName}</strong> · {order.customerEmail}
                    {" · "}
                    Order ID: {order.id.slice(0, 8)}…
                </p>
                {orderReels.length === 0 ? (
                    <p className="muted small">No reels generated for this order yet.</p>
                ) : (
                    <div
                        style={{
                            display: "grid",
                            gap: "var(--pad-md)",
                            marginTop: "var(--pad-md)",
                        }}
                    >
                        {orderReels.map((reel) => (
                            <div
                                key={reel.id}
                                className="panel compact"
                                style={{ padding: "var(--pad-md)" }}
                            >
                                <p className="small muted" style={{ marginBottom: "0.5rem" }}>
                                    {new Date(reel.createdAt).toLocaleString()}
                                </p>
                                <video
                                    src={`${mediaBase}${reel.videoUrl}`}
                                    controls
                                    style={{
                                        maxWidth: "100%",
                                        maxHeight: "70vh",
                                        objectFit: "contain",
                                        borderRadius: "8px",
                                        background: "#000",
                                    }}
                                />
                                <p style={{ marginTop: "0.5rem" }}>
                                    <a
                                        href={`${mediaBase}${reel.videoUrl}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="small"
                                    >
                                        Open video in new tab
                                    </a>
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
