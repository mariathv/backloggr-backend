const admin = require("firebase-admin");
const db = require("../../config/database");
const sendNotificationToUser = async (userId, title, body, data = {}) => {
  try {
    // Get user's FCM token
    const [tokens] = await db.query(
      "SELECT fcm_token FROM user_fcm_tokens WHERE user_id = ?",
      [userId]
    );

    if (tokens.length === 0) {
      console.log(`No FCM token found for user ${userId}`);
      return null;
    }

    const fcmToken = tokens[0].fcm_token;

    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: data,
      token: fcmToken,
      android: {
        priority: "high",
        notification: {
          channelId: "backlog_reminders",
          priority: "high",
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log("Successfully sent notification:", response);
    return response;
  } catch (error) {
    console.error("Error sending notification:", error);

    // If token is invalid, remove it from database
    if (
      error.code === "messaging/invalid-registration-token" ||
      error.code === "messaging/registration-token-not-registered"
    ) {
      await db.query("DELETE FROM user_fcm_tokens WHERE user_id = ?", [userId]);
    }

    throw error;
  }
};

const sendBacklogReminderToAllUsers = async () => {
  try {
    // Get all users who have backlogged games and FCM tokens
    const [users] = await db.query(
      `SELECT DISTINCT u.id as user_id
       FROM users u
       INNER JOIN user_fcm_tokens uft ON u.id = uft.user_id
       INNER JOIN user_games ug ON u.id = ug.user_id
       WHERE ug.status = 'backlogged'`
    );

    console.log(`Sending backlog reminders to ${users.length} users`);

    for (const user of users) {
      try {
        // Get random backlogged game (removed created_at dependency)
        const [games] = await db.query(
          `SELECT ug.*
           FROM user_games ug
           WHERE ug.user_id = ? AND ug.status = 'backlogged'
           ORDER BY RAND()
           LIMIT 1`,
          [user.user_id]
        );

        if (games.length === 0) continue;

        const game = games[0];

        // Get game name from cache
        const [cached] = await db.query(
          "SELECT game_data FROM game_cache WHERE igdb_game_id = ?",
          [game.igdb_game_id]
        );

        let gameName = "a game";
        if (cached.length > 0) {
          const gameDetails = JSON.parse(cached[0].game_data);
          gameName = gameDetails.name || "a game";
        }

        // Send notification
        await sendNotificationToUser(
          user.user_id,
          "Time to play! 🎮",
          `${gameName} has been waiting in your backlog. Why not give it a try today?`,
          {
            type: "backlog_reminder",
            game_id: game.id.toString(),
            igdb_game_id: game.igdb_game_id.toString(),
          }
        );

        // Small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(
          `Error sending notification to user ${user.user_id}:`,
          error
        );
      }
    }

    console.log("Finished sending backlog reminders");
  } catch (error) {
    console.error("Error in sendBacklogReminderToAllUsers:", error);
    throw error;
  }
};

module.exports = {
  sendNotificationToUser,
  sendBacklogReminderToAllUsers,
};
