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
const getUserByPhoneNumber = getUserCredentials.getUserByPhoneNumber;
const getUserCredentialsByUserId = getUserCredentials.getUserCredentialsByUserId;
const updateUserCredentialsByUserId = getUserCredentials.updateUserCredentialsByUserId;
const getTwilioCredentialsByUserId = getUserCredentials.getTwilioCredentialsByUserId;
const getTwilioCredentialsByPhoneNumber = getUserCredentials.getTwilioCredentialsByPhoneNumber;
const multer = require("multer");
const metaDocuments = require("../controller/metaDocuments");
const subscriptions = require("../controller/subscriptions");
const payments = require("../controller/payments");
const adminManagement = require("../controller/adminManagement");
const usage = require("../controller/usage");
const otpAuth = require("../controller/otpAuth");
const ivrLogs = require("../controller/ivrLogs");
const { requireCompany } = require("../middleawre/companymiddleware");
const firebaseAuth = require("../controller/firebaseAuth");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

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
router.post("/api/auth/otp/start", otpAuth.startOtp);
router.post("/api/auth/otp/verify", otpAuth.verifyOtp);
router.post("/api/auth/firebase", firebaseAuth);

router.get("/api/user/credentials", protect, getUserCredentials);
router.get("/internal/user/by-whatsapp-id/:whatsappId", requireInternalApiKey, getUserByWhatsAppId);
router.get("/internal/user/by-phone-number/:phoneNumber", requireInternalApiKey, getUserByPhoneNumber);
router.get("/internal/user/credentials/:userId", requireInternalApiKey, getUserCredentialsByUserId);
router.put("/internal/user/credentials/:userId", requireInternalApiKey, updateUserCredentialsByUserId);
router.get("/internal/twilio/credentials/by-user-id/:userId", requireInternalApiKey, getTwilioCredentialsByUserId);
router.get("/internal/twilio/credentials/by-phone-number/:phoneNumber", requireInternalApiKey, getTwilioCredentialsByPhoneNumber);
router.post("/internal/usage/record", requireInternalApiKey, usage.recordUsage);
router.post("/internal/ivr/log", requireInternalApiKey, ivrLogs.recordConversation);

router.post("/api/nexion/register", register.registeruser);
router.post("/api/forgotpassword", forgotPassword);
router.post("/api/resetpassword/:token", resetPassword);

router.post(
  "/api/meta-documents",
  protect,
  requireCompany,
  upload.single("file"),
  metaDocuments.uploadMetaDocument
);
router.get(
  "/api/meta-documents",
  protect,
  requireCompany,
  metaDocuments.listMetaDocuments
);
router.get(
  "/api/admin/meta-documents",
  protect,
  requireSuperAdmin,
  metaDocuments.listMetaDocumentsAdmin
);
router.post(
  "/api/meta-documents/:id/approve",
  protect,
  requireSuperAdmin,
  metaDocuments.approveMetaDocument
);

router.post("/api/subscriptions/create", protect, requireCompany, subscriptions.createSubscription);
router.post("/api/payments/razorpay/webhook", payments.razorpayWebhook);

router.get("/api/getadmin", protect, requireSuperAdmin, getAdmins);
router.put("/api/edit/:id", protect, requireSuperAdmin, updateUser);
router.delete("/api/delete/:id", protect, requireSuperAdmin, deleteUser);
router.post("/registeradmin", protect, requireSuperAdmin, registerAdmin);
router.post("/api/nexionadmin/admindata", protect, requireSuperAdmin, admindata);
router.get("/api/admin/companies", protect, requireSuperAdmin, adminManagement.getCompanies);
router.get("/api/admin/users", protect, requireSuperAdmin, adminManagement.getUsers);
router.get("/api/admin/payments", protect, requireSuperAdmin, adminManagement.getPayments);
router.get("/api/admin/subscriptions", protect, requireSuperAdmin, adminManagement.getSubscriptions);
router.patch("/api/admin/companies/:id/disable", protect, requireSuperAdmin, adminManagement.disableCompany);

router.post("/api/nexion/logout", authMiddleware, logout);

module.exports = router;

