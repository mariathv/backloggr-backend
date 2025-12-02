const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const libraryController = require("../controllers/libraryController");

router.use(authenticateToken);

router.get("/", libraryController.getUserLibrary);
router.post("/", libraryController.addGameToLibrary);
router.patch("/:gameId", libraryController.updateGameInLibrary);
router.delete("/:gameId", libraryController.deleteGameFromLibrary);

module.exports = router;



