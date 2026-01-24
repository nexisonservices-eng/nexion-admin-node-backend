const express = require('express');
const register = require('../controller/registercontroller');
const authMiddleware = require('../middleawre/middlewarelogout');
const { logout } = require('../controller/logout');
const admindata = require('../controller/admindata');
const loginuser = require('../controller/login');
const protect = require('../middleawre/authmiddleware');
const forgotPassword = require('../controller/forgotpassword');
const resetPassword = require('../controller/resetpassword');
const updateUser = require('../controller/updateuser');
const deleteUser = require('../controller/deleteuser');
const auth = require('../middleawre/adminmiddleware');
const { registerAdmin } = require('../controller/adminregister');
const { superAdminLogin } = require('../controller/superadmin');
const getAdmins = require('../controller/getAdmin');



const router = express.Router();


router.post("/api/nexion/login", loginuser)

router.post("/api/nexion/register", register.registeruser);

router.post("/api/forgotpassword", forgotPassword);
router.post("/api/resetpassword/:token", resetPassword);
//  router.post("/api/nexion/register", register);
router.get("/api/getadmin", getAdmins);
router.put("/api/edit/:id", updateUser);
router.delete("/api/delete/:id", deleteUser);
router.post("/registeradmin", registerAdmin);
router.post("/api/nexionadmin/admindata", admindata);

router.post("/superadmin/login", superAdminLogin);
router.post("/api/nexion/logout", authMiddleware, logout)

module.exports = router;