const db = require("../config/database");
const {
  sendBacklogReminderToAllUsers,
  sendNotificationToUser,
} = require("../src/services/firebaseService");

const admin = require("firebase-admin");
const path = require("path");

// Initialize Firebase only once
if (!admin.apps.length) {
  const serviceAccount = require(path.join(
    __dirname,
    "../config/firebase-service-account.json"
  ));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Test sending notification to all users
async function testAllUsersNotification() {
  console.log("🚀 Testing backlog reminder for all users...\n");

  try {
    await sendBacklogReminderToAllUsers();
    console.log("\n✅ Test completed successfully!");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
  } finally {
    process.exit();
  }
}

// Test sending notification to a specific user
async function testSingleUserNotification(userId) {
  console.log(`🚀 Testing backlog reminder for user ID: ${userId}\n`);

  try {
    // Get a random backlogged game for this user (removed created_at dependency)
    const [games] = await db.query(
      `SELECT ug.*
       FROM user_games ug
       WHERE ug.user_id = ? AND ug.status = 'backlogged'
       ORDER BY RAND()
       LIMIT 1`,
      [userId]
    );

    if (games.length === 0) {
      console.log(`❌ No backlogged games found for user ${userId}`);
      process.exit();
      return;
    }

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

    console.log(`📱 Sending notification about: ${gameName}`);

    // Send notification
    const result = await sendNotificationToUser(
      userId,
      "Time to play! 🎮",
      `${gameName} has been waiting in your backlog. Why not give it a try today?`,
      {
        type: "backlog_reminder",
        game_id: game.id.toString(),
        igdb_game_id: game.igdb_game_id.toString(),
      }
    );

    if (result) {
      console.log("\n✅ Notification sent successfully!");
      console.log("Response:", result);
    } else {
      console.log("\n⚠️ No FCM token found for this user");
    }
  } catch (error) {
    console.error("\n❌ Test failed:", error);
  } finally {
    process.exit();
  }
}

// Test custom notification
async function testCustomNotification(userId, title, body) {
  console.log(`🚀 Testing custom notification for user ID: ${userId}\n`);

  try {
    const result = await sendNotificationToUser(userId, title, body, {
      type: "test_notification",
    });

    if (result) {
      console.log("\n✅ Notification sent successfully!");
      console.log("Response:", result);
    } else {
      console.log("\n⚠️ No FCM token found for this user");
    }
  } catch (error) {
    console.error("\n❌ Test failed:", error);
  } finally {
    process.exit();
  }
}

// List all users with FCM tokens
async function listUsersWithTokens() {
  console.log("📋 Users with FCM tokens:\n");

  try {
    const [users] = await db.query(
      `SELECT u.id, u.username, u.email, uft.fcm_token, uft.updated_at,
              COUNT(ug.id) as backlog_count
       FROM users u
       INNER JOIN user_fcm_tokens uft ON u.id = uft.user_id
       LEFT JOIN user_games ug ON u.id = ug.user_id AND ug.status = 'backlogged'
       GROUP BY u.id, u.username, u.email, uft.fcm_token, uft.updated_at`
    );

    if (users.length === 0) {
      console.log("❌ No users with FCM tokens found");
    } else {
      users.forEach((user, index) => {
        console.log(`${index + 1}. User ID: ${user.id}`);
        console.log(`   Username: ${user.username}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Backlog count: ${user.backlog_count}`);
        console.log(`   Token updated: ${user.updated_at}`);
        console.log(`   FCM Token: ${user.fcm_token.substring(0, 20)}...`);
        console.log("");
      });
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    process.exit();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

console.log("=".repeat(60));
console.log("🔔 BACKLOGGR NOTIFICATION TEST SCRIPT");
console.log("=".repeat(60) + "\n");

switch (command) {
  case "all":
    testAllUsersNotification();
    break;

  case "user":
    const userId = args[1];
    if (!userId) {
      console.log("❌ Please provide a user ID");
      console.log("Usage: node scripts/testNotifications.js user <userId>");
      process.exit();
    }
    testSingleUserNotification(parseInt(userId));
    break;

  case "custom":
    const customUserId = args[1];
    const title = args[2];
    const body = args[3];
    if (!customUserId || !title || !body) {
      console.log("❌ Please provide userId, title, and body");
      console.log(
        'Usage: node scripts/testNotifications.js custom <userId> "Title" "Body message"'
      );
      process.exit();
    }
    testCustomNotification(parseInt(customUserId), title, body);
    break;

  case "list":
    listUsersWithTokens();
    break;

  default:
    console.log("📖 Available commands:\n");
    console.log(
      "  all                          - Send notification to all users with backlogged games"
    );
    console.log(
      "  user <userId>                - Send notification to specific user"
    );
    console.log(
      '  custom <userId> "Title" "Body" - Send custom notification to user'
    );
    console.log(
      "  list                         - List all users with FCM tokens\n"
    );
    console.log("Examples:");
    console.log("  node scripts/testNotifications.js all");
    console.log("  node scripts/testNotifications.js user 1");
    console.log(
      '  node scripts/testNotifications.js custom 1 "Hello!" "Test message"'
    );
    console.log("  node scripts/testNotifications.js list");
    process.exit();
}
