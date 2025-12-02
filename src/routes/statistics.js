const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const statisticsController = require("../controllers/statisticsController");

router.use(authenticateToken);

router.get("/", statisticsController.getUserStatistics);

module.exports = router;



