/**
 * Centralized error handling middleware
 */

const { sendError } = require("../utils/response");
const { AppError } = require("../utils/errors");

const errorHandler = (err, req, res, next) => {
  // Log error for debugging
  console.error("Error:", {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Handle known operational errors
  if (err instanceof AppError) {
    return sendError(res, err.message, err.statusCode, err.errors);
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    return sendError(res, "Invalid token", 401);
  }

  if (err.name === "TokenExpiredError") {
    return sendError(res, "Token expired", 401);
  }

  // Handle validation errors (Joi)
  if (err.isJoi) {
    const errors = err.details.map((detail) => ({
      field: detail.path.join("."),
      message: detail.message,
    }));
    return sendError(res, "Validation failed", 400, errors);
  }

  // Handle database errors
  if (err.code === "ER_DUP_ENTRY") {
    return sendError(res, "Resource already exists", 409);
  }

  if (err.code === "ER_NO_REFERENCED_ROW_2") {
    return sendError(res, "Referenced resource not found", 404);
  }

  // Handle MySQL connection errors
  if (err.code === "ECONNREFUSED" || err.code === "PROTOCOL_CONNECTION_LOST") {
    return sendError(res, "Database connection failed", 503);
  }

  // Default error response
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message;
  return sendError(res, message, err.statusCode || 500);
};

const notFoundHandler = (req, res) => {
  return sendError(res, `Route ${req.method} ${req.path} not found`, 404);
};

module.exports = {
  errorHandler,
  notFoundHandler,
};



