const db = require("../../config/database");
const igdbService = require("../services/igdbService");
const { sendSuccess } = require("../utils/response");
const { ValidationError, NotFoundError } = require("../utils/errors");
const getRandomBacklogGame = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // Get a random backlogged game (removed created_at dependency)
    const [games] = await db.query(
      `SELECT ug.*
       FROM user_games ug
       WHERE ug.user_id = ? AND ug.status = 'backlogged'
       ORDER BY RAND()
       LIMIT 1`,
      [userId]
    );

    if (games.length === 0) {
      throw new NotFoundError("No backlogged games found");
    }

    const game = games[0];

    // Fetch game details from cache or IGDB
    const [cached] = await db.query(
      "SELECT game_data FROM game_cache WHERE igdb_game_id = ?",
      [game.igdb_game_id]
    );

    let gameDetails = null;

    if (cached.length > 0) {
      gameDetails = JSON.parse(cached[0].game_data);
    } else {
      gameDetails = await igdbService.getGameById(game.igdb_game_id);

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

    sendSuccess(res, {
      game: {
        id: game.id,
        igdb_game_id: game.igdb_game_id,
        name: gameDetails?.name || "Unknown Game",
        cover: gameDetails?.cover?.url || null,
        rating: gameDetails?.rating || null,
        game_details: gameDetails,
      },
    });
  } catch (error) {
    next(error);
  }
};

const saveFCMToken = async (req, res, next) => {
  try {
    const { fcm_token } = req.body;
    const userId = req.user.userId;

    if (!fcm_token) {
      throw new ValidationError("FCM token is required");
    }

    // Upsert FCM token
    await db.query(
      `INSERT INTO user_fcm_tokens (user_id, fcm_token, updated_at) 
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE fcm_token = ?, updated_at = NOW()`,
      [userId, fcm_token, fcm_token]
    );

    sendSuccess(res, null, "FCM token saved successfully");
  } catch (error) {
    next(error);
  }
};

const deleteFCMToken = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    await db.query("DELETE FROM user_fcm_tokens WHERE user_id = ?", [userId]);

    sendSuccess(res, null, "FCM token deleted successfully");
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRandomBacklogGame,
  saveFCMToken,
  deleteFCMToken,
};
