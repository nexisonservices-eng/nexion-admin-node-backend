// controller/getAdmin.js
const User = require("../model/loginmodel");

const getAdmins = async (req, res) => {
    try {
        const users = await User.find({ role: "admin" });

        const formattedUsers = users.map((u) => ({
            _id: u._id,
            username: u.username,
            email: u.email,

            // ✅ normalize field names for frontend
            twilioId: u.twilioid || "",
            whatsappId: u.whatsappid || "",
            whatsappToken: u.whatsapptoken || "",
            whatsappBusiness: u.whatsappbussiness || "",
        }));

        res.status(200).json({ users: formattedUsers });
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch admins" });
    }
};

module.exports = getAdmins;
