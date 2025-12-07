const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const notificationController = require("../controllers/notificationController");

router.use(authenticateToken);

// Get random backlogged game for notification
router.get("/random-backlog", notificationController.getRandomBacklogGame);

// Save/update FCM token
router.post("/fcm-token", notificationController.saveFCMToken);

// Delete FCM token (for logout)
router.delete("/fcm-token", notificationController.deleteFCMToken);

module.exports = router;
