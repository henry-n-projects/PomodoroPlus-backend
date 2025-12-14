import { Router, type Request, type Response } from "express";
import authRoutes from "./auth_routes.js";
import sessionRoutes from "./session_routes.js";
import dashboardRoutes from "./dashboard_routes.js";
//import upcomingRouter from "./upcoming_routes.js";
import analyticsRouter from "./analytics_routes.js";
import historyRouter from "./history_routes.js";
const router = Router();

router.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

router.use("/auth", authRoutes);
router.use("/sessions", sessionRoutes);
router.use("/dashboard", dashboardRoutes);
//router.use("/upcoming", upcomingRouter);
router.use("/analytics", analyticsRouter);
router.use("/history", historyRouter);
export default router;
