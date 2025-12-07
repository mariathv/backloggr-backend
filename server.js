const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const admin = require("firebase-admin");
require("dotenv").config();

const {
  errorHandler,
  notFoundHandler,
} = require("./src/middleware/errorHandler");
const { sendSuccess } = require("./src/utils/response");
const igdbService = require("./src/services/igdbService");
const notificationRoutes = require("./src/routes/notification");
const { scheduleBacklogReminders } = require("./jobs/notificationScheduler");

const app = express();

// Middleware
app.use(morgan("dev"));
app.use(helmet({ crossOriginResourcePolicy: false })); // Allow cross-origin for static assets
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const serviceAccount = require("./config/firebase-service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Serve static files
app.use("/uploads", express.static("uploads"));

// Health check endpoint
app.get("/health", (req, res) => {
  sendSuccess(res, {
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// IGDB health check endpoint
app.get("/health/igdb", async (req, res, next) => {
  try {
    const health = await igdbService.healthCheck();
    if (health.status === "ok") {
      sendSuccess(res, health);
    } else {
      res.status(503).json({
        success: false,
        error: {
          message: health.message,
          status: 503,
        },
      });
    }
  } catch (error) {
    next(error);
  }
});

// API Routes
app.use("/api/auth", require("./src/routes/auth"));
app.use("/api/games", require("./src/routes/games"));
app.use("/api/library", require("./src/routes/library"));
app.use("/api/statistics", require("./src/routes/statistics"));
app.use("/api/notifications", notificationRoutes);

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

scheduleBacklogReminders();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backloggr API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);

  // Check IGDB configuration on startup
  igdbService.healthCheck().then((health) => {
    if (health.status === "ok") {
      console.log("✓ IGDB service is configured and ready");
    } else {
      console.warn(`⚠ IGDB service: ${health.message}`);
    }
  });
});
