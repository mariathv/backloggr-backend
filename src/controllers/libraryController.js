const db = require("../../config/database");
const igdbService = require("../services/igdbService");
const { sendSuccess } = require("../utils/response");
const {
  ValidationError,
  NotFoundError,
  ConflictError,
} = require("../utils/errors");

const getUserLibrary = async (req, res, next) => {
  try {
    const { status, search, limit = 50, offset = 0 } = req.query;
    const userId = req.user.userId;

    let query = `
      SELECT ug.* 
      FROM user_games ug
      LEFT JOIN game_cache gc ON ug.igdb_game_id = gc.igdb_game_id
      WHERE ug.user_id = ?
    `;
    const params = [userId];

    // Add status filter
    if (status) {
      query += " AND ug.status = ?";
      params.push(status);
    }

    // Add search filter
    if (search && search.trim() !== "") {
      query += " AND gc.game_data LIKE ?";
      params.push(`%${search.trim()}%`);
    }

    query += " ORDER BY ug.updated_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const [games] = await db.query(query, params);

    // Get total count for the filtered results
    let countQuery = `
      SELECT COUNT(*) as total
      FROM user_games ug
      LEFT JOIN game_cache gc ON ug.igdb_game_id = gc.igdb_game_id
      WHERE ug.user_id = ?
    `;
    const countParams = [userId];

    if (status) {
      countQuery += " AND ug.status = ?";
      countParams.push(status);
    }

    if (search && search.trim() !== "") {
      countQuery += " AND gc.game_data LIKE ?";
      countParams.push(`%${search.trim()}%`);
    }

    const [countResult] = await db.query(countQuery, countParams);
    const totalCount = countResult[0].total;

    // Fetch game details for each game in the library
    const gamesWithDetails = await Promise.all(
      games.map(async (game) => {
        try {
          // Check cache first
          const [cached] = await db.query(
            "SELECT game_data FROM game_cache WHERE igdb_game_id = ?",
            [game.igdb_game_id]
          );

          let gameDetails = null;

          if (cached.length > 0) {
            gameDetails = JSON.parse(cached[0].game_data);
          } else {
            // Fetch from IGDB if not cached
            gameDetails = await igdbService.getGameById(game.igdb_game_id);

            // Cache the result if found
            if (gameDetails) {
              await db.query(
                "INSERT INTO game_cache (igdb_game_id, game_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE game_data = ?, cached_at = CURRENT_TIMESTAMP",
                [
                  game.igdb_game_id,
                  JSON.stringify(gameDetails),
                  JSON.stringify(gameDetails),
                ]
              );
            }
          }

          return {
            ...game,
            game_details: gameDetails,
          };
        } catch (error) {
          // If fetching game details fails, return the game without details
          console.error(
            `Failed to fetch details for game ${game.igdb_game_id}:`,
            error.message
          );
          return {
            ...game,
            game_details: null,
          };
        }
      })
    );

    sendSuccess(res, {
      games: gamesWithDetails,
      count: gamesWithDetails.length,
      total: totalCount,
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
    if (
      updates.rating !== undefined &&
      (updates.rating < 0 || updates.rating > 10)
    ) {
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

const getLibraryGameDetails = async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const userId = req.user.userId;

    // 1. Fetch user game entry
    const [userGame] = await db.query(
      `SELECT ug.* 
       FROM user_games ug
       WHERE ug.user_id = ? AND ug.id = ?`,
      [userId, gameId]
    );

    if (userGame.length === 0) {
      throw new NotFoundError("Game not found in your library");
    }

    const game = userGame[0];

    // 2. Fetch details from cache/IGDB
    // Check cache first
    const [cached] = await db.query(
      "SELECT game_data FROM game_cache WHERE igdb_game_id = ?",
      [game.igdb_game_id]
    );

    let gameDetails = null;

    if (cached.length > 0) {
      gameDetails = JSON.parse(cached[0].game_data);
    } else {
      // Fetch from IGDB if not cached
      gameDetails = await igdbService.getGameById(game.igdb_game_id);

      // Cache the result if found
      if (gameDetails) {
        await db.query(
          "INSERT INTO game_cache (igdb_game_id, game_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE game_data = ?, cached_at = CURRENT_TIMESTAMP",
          [
            game.igdb_game_id,
            JSON.stringify(gameDetails),
            JSON.stringify(gameDetails),
          ]
        );
      }
    }

    // 3. Fetch user uploaded screenshots
    const [screenshots] = await db.query(
      "SELECT id, filename, created_at FROM user_screenshots WHERE user_id = ? AND igdb_game_id = ?",
      [userId, game.igdb_game_id]
    );

    // Add full URL to screenshots
    const screenshotsWithUrls = screenshots.map((s) => ({
      ...s,
      url: `${req.protocol}://${req.get("host")}/uploads/${s.filename}`,
    }));

    // 4. Merge data
    // Ensure photos object exists in gameDetails/merged data
    const mergedGame = {
      ...game,
      game_details: gameDetails,
      user_screenshots: screenshotsWithUrls,
    };

    // If the user wants screenshots under "Photos" object as requested:
    // "under Photos, add a screenshots object with user uploaded screenshots"
    // I will attach it to the response structure clearly.

    sendSuccess(res, {
      game: mergedGame,
    });
  } catch (error) {
    next(error);
  }
};
const uploadScreenshot = async (req, res, next) => {
  try {
    console.log("Upload Screenshot called"); // Log function entry
    const { gameId } = req.params;
    const userId = req.user.userId;
    console.log("User ID:", userId, "Game ID:", gameId);

    if (!req.file) {
      console.log("No file received"); // Log missing file
      throw new ValidationError("No image file provided");
    }

    console.log("File received:", req.file.filename, req.file.path);

    // Verify game exists in library first
    const [userGame] = await db.query(
      "SELECT igdb_game_id FROM user_games WHERE user_id = ? AND id = ?",
      [userId, gameId]
    );

    console.log("User game query result:", userGame);

    if (userGame.length === 0) {
      console.log("Game not found in user's library");
      throw new NotFoundError("Game not found in your library");
    }

    const igdbGameId = userGame[0].igdb_game_id;

    // Save to DB
    const [result] = await db.query(
      "INSERT INTO user_screenshots (user_id, igdb_game_id, filename) VALUES (?, ?, ?)",
      [userId, igdbGameId, req.file.filename]
    );

    console.log("Screenshot saved to DB with ID:", result.insertId);

    const screenshotUrl = `${req.protocol}://${req.get("host")}/uploads/${
      req.file.filename
    }`;

    sendSuccess(
      res,
      {
        id: result.insertId,
        url: screenshotUrl,
        filename: req.file.filename,
      },
      "Screenshot uploaded successfully",
      201
    );
  } catch (error) {
    console.error("Error in uploadScreenshot:", error);
    next(error);
  }
};

module.exports = {
  getUserLibrary,
  addGameToLibrary,
  updateGameInLibrary,
  deleteGameFromLibrary,
  getLibraryGameDetails,
  uploadScreenshot,
};
