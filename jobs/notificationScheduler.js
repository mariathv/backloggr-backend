const cron = require("node-cron");
const {
  sendBacklogReminderToAllUsers,
} = require("../src/services/firebaseService");

const scheduleBacklogReminders = () => {
  // Run at 1:00 PM every day
  cron.schedule(
    "0 13 * * *",
    async () => {
      console.log("Running daily backlog reminder job at 1 PM");
      try {
        await sendBacklogReminderToAllUsers();
      } catch (error) {
        console.error("Error in scheduled backlog reminder:", error);
      }
    },
    {
      timezone: "Asia/Karachi", // Set your timezone
    }
  );

  console.log(
    "Backlog reminder scheduler initialized - will run daily at 1 PM"
  );
};

module.exports = { scheduleBacklogReminders };
