const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const { errorHandler, notFoundHandler } = require("./src/middleware/errorHandler");
const { sendSuccess } = require("./src/utils/response");
const igdbService = require("./src/services/igdbService");

const app = express();

// Middleware
app.use(morgan("dev"));
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

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
