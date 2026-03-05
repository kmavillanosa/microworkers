import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { StudioTwickEditor } from "../components";
import { useAppStore } from "../stores/useAppStore";

/**
 * StudioNewPage - Twick-based editor workspace at /studio-new
 */
export function StudioNewPage() {
    const [searchParams] = useSearchParams();
    const orders = useAppStore((state) => state.orders);

    const orderIdFromUrl = searchParams.get("orderId")?.trim() ?? "";

    const selectedOrder = useMemo(
        () =>
            orderIdFromUrl
                ? orders.find((order) => order.id === orderIdFromUrl) ?? null
                : null,
        [orderIdFromUrl, orders],
    );

    return (
        <div className="studio-page">
            <section className="panel output-panel" style={{ height: "calc(100dvh - 120px)" }}>
                <div className="header" style={{ marginBottom: "var(--pad-sm)" }}>
                    <h2>Studio New</h2>
                    <p className="muted small">
                        Twick editor workspace for advanced timeline editing.
                    </p>
                </div>

                <StudioTwickEditor
                    previewSize="phone"
                    selectedOrderId={selectedOrder?.id ?? null}
                    selectedOrderOutputSize={selectedOrder?.outputSize ?? null}
                    script={selectedOrder?.script ?? ""}
                />
            </section>
        </div>
    );
}
