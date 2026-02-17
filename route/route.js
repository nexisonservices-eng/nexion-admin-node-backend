const express = require("express");
const register = require("../controller/registercontroller");
const authMiddleware = require("../middleawre/middlewarelogout");
const { logout } = require("../controller/logout");
const admindata = require("../controller/admindata");
const loginuser = require("../controller/login");
const protect = require("../middleawre/authmiddleware");
const forgotPassword = require("../controller/forgotpassword");
const resetPassword = require("../controller/resetpassword");
const updateUser = require("../controller/updateuser");
const deleteUser = require("../controller/deleteuser");
const { requireSuperAdmin } = require("../middleawre/adminmiddleware");
const { registerAdmin } = require("../controller/adminregister");
const { superAdminLogin } = require("../controller/superadmin");
const getAdmins = require("../controller/getAdmin");
const getUserCredentials = require("../controller/usercredentials");
const getUserByWhatsAppId = getUserCredentials.getUserByWhatsAppId;

const router = express.Router();

const requireInternalApiKey = (req, res, next) => {
  const configuredKey = process.env.INTERNAL_API_KEY;
  if (!configuredKey) {
    return res.status(500).json({ message: "INTERNAL_API_KEY is not configured" });
  }

  const apiKey = req.headers["x-internal-api-key"];
  if (!apiKey || apiKey !== configuredKey) {
    return res.status(401).json({ message: "Unauthorized internal request" });
  }

  next();
};

router.post("/api/nexion/login", loginuser);
router.post("/superadmin/login", superAdminLogin);

router.get("/api/user/credentials", protect, getUserCredentials);
router.get("/internal/user/by-whatsapp-id/:whatsappId", requireInternalApiKey, getUserByWhatsAppId);

router.post("/api/nexion/register", register.registeruser);
router.post("/api/forgotpassword", forgotPassword);
router.post("/api/resetpassword/:token", resetPassword);

router.get("/api/getadmin", protect, requireSuperAdmin, getAdmins);
router.put("/api/edit/:id", protect, requireSuperAdmin, updateUser);
router.delete("/api/delete/:id", protect, requireSuperAdmin, deleteUser);
router.post("/registeradmin", protect, requireSuperAdmin, registerAdmin);
router.post("/api/nexionadmin/admindata", protect, requireSuperAdmin, admindata);

router.post("/api/nexion/logout", authMiddleware, logout);

module.exports = router;
