// controller/getAdmin.js
const User = require("../model/loginmodel");

const getAdmins = async (req, res) => {
  try {
    // only filter admins
    const users = await User.find({ role: "admin" });

    // return directly
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch admins",
      error: error.message,
    });
  }
};

module.exports = getAdmins;

