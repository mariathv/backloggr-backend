const igdbService = require("../services/igdbService");
const db = require("../../config/database");
const { sendSuccess } = require("../utils/response");
const { ValidationError, NotFoundError } = require("../utils/errors");

const searchGames = async (req, res, next) => {
  try {
    const { q, limit = 10, offset = 0 } = req.query;

    if (!q || q.trim() === "") {
      throw new ValidationError("Search query is required");
    }

    const games = await igdbService.searchGames(
      q.trim(),
      parseInt(limit),
      parseInt(offset)
    );

    // map games to match the structure of library games
    const gamesWithDetails = games.map((game) => ({
      game_details: game,
    }));

    sendSuccess(res, {
      games: gamesWithDetails,
      count: gamesWithDetails.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    next(error);
  }
};

const getGameById = async (req, res, next) => {
  try {
    const { gameId } = req.params;

    if (!gameId || isNaN(gameId)) {
      throw new ValidationError("Valid game ID is required");
    }

    // Check cache first
    const [cached] = await db.query(
      "SELECT game_data, cached_at FROM game_cache WHERE igdb_game_id = ?",
      [gameId]
    );

    if (cached.length > 0) {
      const cacheAge = Date.now() - new Date(cached[0].cached_at).getTime();
      // Cache for 7 days
      if (cacheAge < 7 * 24 * 60 * 60 * 1000) {
        return sendSuccess(res, {
          game: JSON.parse(cached[0].game_data),
          cached: true,
        });
      }
    }

    // Fetch from IGDB
    const game = await igdbService.getGameById(gameId);

    if (!game) {
      throw new NotFoundError("Game not found");
    }

    // Update cache
    await db.query(
      "INSERT INTO game_cache (igdb_game_id, game_data) VALUES (?, ?) ON DUPLICATE KEY UPDATE game_data = ?, cached_at = CURRENT_TIMESTAMP",
      [gameId, JSON.stringify(game), JSON.stringify(game)]
    );

    sendSuccess(res, { game, cached: false });
  } catch (error) {
    next(error);
  }
};

const getPopularGames = async (req, res, next) => {
  try {
    const { limit = 20 } = req.query;
    const games = await igdbService.getPopularGames(parseInt(limit));

    const gamesWithDetails = games.map((game) => ({
      game_details: game,
    }));

    sendSuccess(res, {
      games: gamesWithDetails,
      count: gamesWithDetails.length,
      limit: parseInt(limit),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  searchGames,
  getGameById,
  getPopularGames,
};
