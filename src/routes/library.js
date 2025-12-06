const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const libraryController = require("../controllers/libraryController");

router.use(authenticateToken);

const upload = require("../middleware/uploadMiddleware");

router.get("/", libraryController.getUserLibrary);
router.post("/", libraryController.addGameToLibrary);
router.get("/:gameId", libraryController.getLibraryGameDetails);
router.patch("/:gameId", libraryController.updateGameInLibrary);
router.delete("/:gameId", libraryController.deleteGameFromLibrary);

router.post(
  "/:gameId/screenshots",
  upload.single("screenshot"),
  libraryController.uploadScreenshot
);

module.exports = router;
