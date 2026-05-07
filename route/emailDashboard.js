const express = require("express");
const protect = require("../middleawre/authmiddleware");
const emailDashboardController = require("../controller/emailDashboard");

const router = express.Router();

router.get("/overview", protect, emailDashboardController.getOverview);
router.get("/history", protect, emailDashboardController.getHistory);

module.exports = router;
