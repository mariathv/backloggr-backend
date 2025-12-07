const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../../config/database");
const { sendSuccess, sendError } = require("../utils/response");
const { ConflictError, AuthenticationError } = require("../utils/errors");

const register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const [existing] = await db.query(
      "SELECT id FROM users WHERE email = ? OR username = ?",
      [email, username]
    );

    if (existing.length > 0) {
      throw new ConflictError(
        "User with this email or username already exists"
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const [result] = await db.query(
      "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
      [username, email, passwordHash]
    );

    // Initialize user statistics
    await db.query("INSERT INTO user_statistics (user_id) VALUES (?)", [
      result.insertId,
    ]);

    // Generate token
    const token = jwt.sign(
      { userId: result.insertId, username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    sendSuccess(
      res,
      {
        token,
        user: { id: result.insertId, username, email },
      },
      "User registered successfully",
      201
    );
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Find user
    const [users] = await db.query(
      "SELECT id, username, email, password_hash FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      throw new AuthenticationError("Invalid email or password");
    }

    const user = users[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      throw new AuthenticationError("Invalid email or password");
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    sendSuccess(
      res,
      {
        token,
        user: { id: user.id, username: user.username, email: user.email },
      },
      "Login successful"
    );
  } catch (error) {
    next(error);
  }
};
const me = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // Fetch user details from DB
    const [users] = await db.query(
      "SELECT id, username, email FROM users WHERE id = ?",
      [userId]
    );

    if (users.length === 0) {
      throw new AuthenticationError("User not found");
    }

    const user = users[0];

    sendSuccess(
      res,
      { user },
      "Authenticated user details fetched successfully"
    );
  } catch (error) {
    next(error);
  }
};
module.exports = {
  register,
  login,
  me,
};
