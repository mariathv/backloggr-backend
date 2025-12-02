const jwt = require("jsonwebtoken");
const { AuthenticationError } = require("../utils/errors");

function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      throw new AuthenticationError("Access token required");
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        throw new AuthenticationError("Invalid or expired token");
      }
      req.user = user;
      next();
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { authenticateToken };



