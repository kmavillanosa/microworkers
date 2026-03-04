import { Component, useEffect, useMemo, type ErrorInfo, type ReactNode } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { OrderOutputPage } from "./components";
import { OrdersPage, OutputsPage, SettingsPage, StudioPage } from "./pages";
import { useAppStore } from "./stores/useAppStore";
import "./App.css";

type AppRouteBoundaryProps = {
    children: ReactNode;
};

type AppRouteBoundaryState = {
    hasError: boolean;
    message: string;
};

class AppRouteBoundary extends Component<AppRouteBoundaryProps, AppRouteBoundaryState> {
    state: AppRouteBoundaryState = {
        hasError: false,
        message: "",
    };

    static getDerivedStateFromError(error: unknown): AppRouteBoundaryState {
        return {
            hasError: true,
            message: error instanceof Error ? error.message : "Unexpected route render error.",
        };
    }

    componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
        console.error("Route render error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="studio-page">
                    <h2>Something went wrong</h2>
                    <p className="muted">{this.state.message}</p>
                    <button type="button" className="ghost-btn" onClick={() => window.location.reload()}>
                        Reload page
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

function App() {
    const navigate = useNavigate();
    const location = useLocation();

    const initialize = useAppStore((state) => state.initialize);
    const refreshAll = useAppStore((state) => state.refreshAll);
    const handleOAuthConnectedRedirect = useAppStore(
        (state) => state.handleOAuthConnectedRedirect,
    );
    const loadPipelines = useAppStore((state) => state.loadPipelines);
    const loadActiveJobs = useAppStore((state) => state.loadActiveJobs);

    const envLabel = useAppStore((state) => state.envLabel);
    const apiBaseUrl = useAppStore((state) => state.apiBaseUrl);
    const orders = useAppStore((state) => state.orders);
    const reels = useAppStore((state) => state.reels);
    const pipelineRunningIds = useAppStore((state) => state.pipelineRunningIds);
    const orderDeletingId = useAppStore((state) => state.orderDeletingId);
    const handleDeleteOrder = useAppStore((state) => state.handleDeleteOrder);

    const safeOrders = useMemo(
        () => (Array.isArray(orders) ? orders.filter((item): item is NonNullable<typeof item> => Boolean(item)) : []),
        [orders],
    );

    const safeReels = useMemo(
        () => (Array.isArray(reels) ? reels.filter((item): item is NonNullable<typeof item> => Boolean(item)) : []),
        [reels],
    );

    useEffect(() => {
        void initialize();
    }, [initialize]);

    useEffect(() => {
        void (async () => {
            const handled = await handleOAuthConnectedRedirect(location.search);
            if (!handled) return;
            const url = new URL(window.location.href);
            url.searchParams.delete("connected");
            window.history.replaceState({}, "", url.toString());
        })();
    }, [handleOAuthConnectedRedirect, location.search]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            void loadActiveJobs();
        }, 4000);
        return () => window.clearInterval(timer);
    }, [loadActiveJobs]);

    useEffect(() => {
        if (pipelineRunningIds.size === 0) return;
        const timer = window.setInterval(() => {
            void loadPipelines();
        }, 8000);
        return () => window.clearInterval(timer);
    }, [loadPipelines, pipelineRunningIds]);

    const pendingOrdersCount = useMemo(
        () => safeOrders.filter((order) => order?.orderStatus === "pending").length,
        [safeOrders],
    );

    return (
        <div className="studio-app">
            <header className="topbar">
                <nav className="view-tabs" aria-label="Main">
                    <NavLink
                        to="/"
                        end
                        className={({ isActive }) => (isActive ? "active" : "")}
                    >
                        Studio
                    </NavLink>
                    <NavLink to="/outputs" className={({ isActive }) => (isActive ? "active" : "")}>Outputs</NavLink>
                    <NavLink to="/settings" className={({ isActive }) => (isActive ? "active" : "")}>Settings</NavLink>
                    <NavLink to="/orders" className={({ isActive }) => (isActive ? "active" : "")}>
                        Orders
                        {pendingOrdersCount > 0 && (
                            <span className="nav-badge" aria-label={`${pendingOrdersCount} pending`}>
                                {pendingOrdersCount}
                            </span>
                        )}
                    </NavLink>
                </nav>

                <div className="topbar-right">
                    {envLabel !== "production" && (
                        <span
                            className={`env-badge env-badge-${envLabel}`}
                            title={`Environment: ${envLabel}`}
                        >
                            You are running on {envLabel} environment
                        </span>
                    )}
                    <button type="button" className="ghost-btn" onClick={() => void refreshAll()}>
                        Refresh
                    </button>
                </div>
            </header>

            <AppRouteBoundary key={`${location.pathname}${location.search}`}>
                <Routes>
                    <Route path="/orders" element={<OrdersPage />} />
                    <Route path="/" element={<StudioPage />} />
                    <Route path="/outputs" element={<OutputsPage />} />
                    <Route path="/settings" element={<Navigate to="/settings/accounts" replace />} />
                    <Route path="/settings/:tab" element={<SettingsPage />} />
                    <Route
                        path="/orders/:orderId/output"
                        element={
                            <OrderOutputPage
                                orders={safeOrders}
                                reels={safeReels}
                                navigate={navigate}
                                apiBaseUrl={apiBaseUrl}
                                onDeleteOrder={handleDeleteOrder}
                                orderDeletingId={orderDeletingId}
                            />
                        }
                    />
                    <Route path="*" element={<StudioPage />} />
                </Routes>
            </AppRouteBoundary>
        </div>
    );
}

export default App;
