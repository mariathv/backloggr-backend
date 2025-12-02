const express = require("express");
const router = express.Router();
const gamesController = require("../controllers/gamesController");

router.get("/search", gamesController.searchGames);
router.get("/popular/list", gamesController.getPopularGames);
router.get("/:gameId", gamesController.getGameById);

module.exports = router;



