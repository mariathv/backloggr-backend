const db = require("../../config/database");
const { sendSuccess } = require("../utils/response");
const { NotFoundError } = require("../utils/errors");

const getUserStatistics = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const [stats] = await db.query(
      "SELECT * FROM user_statistics WHERE user_id = ?",
      [userId]
    );

    if (stats.length === 0) {
      throw new NotFoundError("Statistics not found");
    }

    sendSuccess(res, { statistics: stats[0] });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserStatistics,
};



