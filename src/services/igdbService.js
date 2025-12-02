const axios = require("axios");
const { AppError } = require("../utils/errors");

class IGDBService {
  constructor() {
    this.clientId = process.env.IGDB_CLIENT_ID;
    this.clientSecret = process.env.IGDB_CLIENT_SECRET;
    this.accessToken = null;
    this.tokenExpiry = null;

    // Validate configuration
    if (!this.clientId || !this.clientSecret) {
      console.warn(
        "Warning: IGDB_CLIENT_ID or IGDB_CLIENT_SECRET not set. IGDB service will not work."
      );
    }
  }

  async getAccessToken() {
    // Check if we have a valid cached token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new AppError(
        "IGDB credentials not configured. Please set IGDB_CLIENT_ID and IGDB_CLIENT_SECRET environment variables.",
        500
      );
    }

    try {
      const response = await axios.post(
        `https://id.twitch.tv/oauth2/token?client_id=${this.clientId}&client_secret=${this.clientSecret}&grant_type=client_credentials`
      );

      if (!response.data.access_token) {
        throw new AppError("Failed to obtain IGDB access token", 500);
      }

      this.accessToken = response.data.access_token;
      // Set expiry with 1 minute buffer
      this.tokenExpiry =
        Date.now() + (response.data.expires_in - 60) * 1000;
      return this.accessToken;
    } catch (error) {
      if (error.response) {
        throw new AppError(
          `IGDB authentication failed: ${error.response.data?.message || error.message}`,
          500
        );
      }
      throw new AppError(
        `Failed to connect to IGDB: ${error.message}`,
        503
      );
    }
  }

  async searchGames(query, limit = 10, offset = 0) {
    try {
      const token = await this.getAccessToken();

      const response = await axios.post(
        "https://api.igdb.com/v4/games",
        `search "${query}"; fields name, cover.url, first_release_date, summary, platforms.name, genres.name, rating, rating_count; limit ${limit}; offset ${offset};`,
        {
          headers: {
            "Client-ID": this.clientId,
            Authorization: `Bearer ${token}`,
            "Content-Type": "text/plain",
          },
        }
      );

      return response.data || [];
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message || "IGDB API error";
        
        if (status === 401) {
          // Token might be expired, try refreshing
          this.accessToken = null;
          this.tokenExpiry = null;
          return this.searchGames(query, limit, offset);
        }
        
        throw new AppError(
          `IGDB search failed: ${message}`,
          status >= 500 ? 503 : 400
        );
      }
      throw new AppError(
        `Failed to search games: ${error.message}`,
        503
      );
    }
  }

  async getGameById(gameId) {
    try {
      const token = await this.getAccessToken();

      const response = await axios.post(
        "https://api.igdb.com/v4/games",
        `fields name, cover.url, first_release_date, summary, storyline, platforms.name, genres.name, rating, rating_count, screenshots.url, videos.video_id, involved_companies.company.name, involved_companies.developer, involved_companies.publisher; where id = ${gameId};`,
        {
          headers: {
            "Client-ID": this.clientId,
            Authorization: `Bearer ${token}`,
            "Content-Type": "text/plain",
          },
        }
      );

      if (!response.data || response.data.length === 0) {
        return null;
      }

      return response.data[0];
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message || "IGDB API error";
        
        if (status === 401) {
          // Token might be expired, try refreshing
          this.accessToken = null;
          this.tokenExpiry = null;
          return this.getGameById(gameId);
        }
        
        throw new AppError(
          `IGDB request failed: ${message}`,
          status >= 500 ? 503 : 400
        );
      }
      throw new AppError(
        `Failed to get game details: ${error.message}`,
        503
      );
    }
  }

  async getPopularGames(limit = 20) {
    try {
      const token = await this.getAccessToken();

      const response = await axios.post(
        "https://api.igdb.com/v4/games",
        `fields name, cover.url, first_release_date, summary, platforms.name, genres.name, rating, rating_count; sort rating_count desc; where rating_count > 100; limit ${limit};`,
        {
          headers: {
            "Client-ID": this.clientId,
            Authorization: `Bearer ${token}`,
            "Content-Type": "text/plain",
          },
        }
      );

      return response.data || [];
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message || "IGDB API error";
        
        if (status === 401) {
          // Token might be expired, try refreshing
          this.accessToken = null;
          this.tokenExpiry = null;
          return this.getPopularGames(limit);
        }
        
        throw new AppError(
          `IGDB request failed: ${message}`,
          status >= 500 ? 503 : 400
        );
      }
      throw new AppError(
        `Failed to get popular games: ${error.message}`,
        503
      );
    }
  }

  /**
   * Health check method to verify IGDB service is configured and working
   */
  async healthCheck() {
    try {
      if (!this.clientId || !this.clientSecret) {
        return {
          status: "not_configured",
          message: "IGDB credentials not set",
        };
      }

      // Try to get an access token
      await this.getAccessToken();
      return {
        status: "ok",
        message: "IGDB service is configured and accessible",
      };
    } catch (error) {
      return {
        status: "error",
        message: error.message,
      };
    }
  }
}

const igdbService = new IGDBService();
module.exports = igdbService;



