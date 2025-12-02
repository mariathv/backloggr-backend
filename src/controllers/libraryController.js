const db = require("../../config/database");
const { sendSuccess } = require("../utils/response");
const { ValidationError, NotFoundError, ConflictError } = require("../utils/errors");

const getUserLibrary = async (req, res, next) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const userId = req.user.userId;

    let query = "SELECT * FROM user_games WHERE user_id = ?";
    const params = [userId];

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const [games] = await db.query(query, params);

    sendSuccess(res, {
      games,
      count: games.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    next(error);
  }
};

const addGameToLibrary = async (req, res, next) => {
  try {
    const { igdb_game_id, status = "backlogged", rating, notes } = req.body;
    const userId = req.user.userId;

    if (!igdb_game_id) {
      throw new ValidationError("Game ID is required");
    }

    // Validate status
    const validStatuses = [
      "playing",
      "completed",
      "on_hold",
      "dropped",
      "backlogged",
      "played",
    ];
    if (status && !validStatuses.includes(status)) {
      throw new ValidationError(
        `Status must be one of: ${validStatuses.join(", ")}`
      );
    }

    // Validate rating if provided
    if (rating !== undefined && (rating < 0 || rating > 10)) {
      throw new ValidationError("Rating must be between 0 and 10");
    }

    try {
      const [result] = await db.query(
        "INSERT INTO user_games (user_id, igdb_game_id, status, rating, notes) VALUES (?, ?, ?, ?, ?)",
        [userId, igdb_game_id, status, rating || null, notes || null]
      );

      await updateUserStatistics(userId);

      sendSuccess(
        res,
        { gameId: result.insertId },
        "Game added to library successfully",
        201
      );
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        throw new ConflictError("Game already exists in your library");
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

const updateGameInLibrary = async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.userId;
    const updates = req.body;

    const allowedFields = [
      "status",
      "rating",
      "hours_played",
      "notes",
      "start_date",
      "completion_date",
    ];
    const setClause = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (setClause.length === 0) {
      throw new ValidationError("No valid fields to update");
    }

    // Validate status if provided
    if (updates.status) {
      const validStatuses = [
        "playing",
        "completed",
        "on_hold",
        "dropped",
        "backlogged",
        "played",
      ];
      if (!validStatuses.includes(updates.status)) {
        throw new ValidationError(
          `Status must be one of: ${validStatuses.join(", ")}`
        );
      }
    }

    // Validate rating if provided
    if (updates.rating !== undefined && (updates.rating < 0 || updates.rating > 10)) {
      throw new ValidationError("Rating must be between 0 and 10");
    }

    values.push(userId, gameId);

    const [result] = await db.query(
      `UPDATE user_games SET ${setClause.join(
        ", "
      )} WHERE user_id = ? AND id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      throw new NotFoundError("Game not found in your library");
    }

    await updateUserStatistics(userId);

    sendSuccess(res, null, "Game updated successfully");
  } catch (error) {
    next(error);
  }
};

const deleteGameFromLibrary = async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.userId;

    const [result] = await db.query(
      "DELETE FROM user_games WHERE user_id = ? AND id = ?",
      [userId, gameId]
    );

    if (result.affectedRows === 0) {
      throw new NotFoundError("Game not found in your library");
    }

    await updateUserStatistics(userId);

    sendSuccess(res, null, "Game removed from library successfully");
  } catch (error) {
    next(error);
  }
};

async function updateUserStatistics(userId) {
  const [stats] = await db.query(
    `
    SELECT 
      COUNT(*) as total_games,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_games,
      SUM(CASE WHEN status = 'playing' THEN 1 ELSE 0 END) as playing_games,
      SUM(CASE WHEN status = 'backlogged' THEN 1 ELSE 0 END) as backlogged_games,
      SUM(CASE WHEN status = 'dropped' THEN 1 ELSE 0 END) as dropped_games,
      SUM(CASE WHEN status = 'on_hold' THEN 1 ELSE 0 END) as on_hold_games,
      SUM(hours_played) as total_hours
    FROM user_games WHERE user_id = ?
  `,
    [userId]
  );

  await db.query(
    `UPDATE user_statistics SET 
      total_games = ?, completed_games = ?, playing_games = ?,
      backlogged_games = ?, dropped_games = ?, on_hold_games = ?, total_hours = ?
    WHERE user_id = ?`,
    [
      stats[0].total_games,
      stats[0].completed_games,
      stats[0].playing_games,
      stats[0].backlogged_games,
      stats[0].dropped_games,
      stats[0].on_hold_games,
      stats[0].total_hours || 0,
      userId,
    ]
  );
}

module.exports = {
  getUserLibrary,
  addGameToLibrary,
  updateGameInLibrary,
  deleteGameFromLibrary,
};



