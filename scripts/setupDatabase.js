const mysql = require("mysql2/promise");
require("dotenv").config();

const setupDatabase = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`
    );
    await connection.query(`USE ${process.env.DB_NAME}`);

    // Users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_username (username),
        INDEX idx_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // User games table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_games (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        igdb_game_id INT NOT NULL,
        status ENUM('playing', 'completed', 'on_hold', 'dropped', 'backlogged', 'played') NOT NULL,
        rating DECIMAL(3,1) CHECK (rating >= 0 AND rating <= 10),
        hours_played DECIMAL(8,2) DEFAULT 0,
        notes TEXT,
        start_date DATE,
        completion_date DATE,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_game (user_id, igdb_game_id),
        INDEX idx_user_status (user_id, status),
        INDEX idx_igdb_game (igdb_game_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Game cache table (to reduce IGDB API calls)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS game_cache (
        igdb_game_id INT PRIMARY KEY,
        game_data JSON NOT NULL,
        cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cached_at (cached_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // User statistics table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_statistics (
        user_id INT PRIMARY KEY,
        total_games INT DEFAULT 0,
        completed_games INT DEFAULT 0,
        playing_games INT DEFAULT 0,
        backlogged_games INT DEFAULT 0,
        dropped_games INT DEFAULT 0,
        on_hold_games INT DEFAULT 0,
        total_hours DECIMAL(10,2) DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log("Database setup completed successfully!");
  } catch (error) {
    console.error("Error setting up database:", error);
  } finally {
    await connection.end();
  }
};

setupDatabase();
