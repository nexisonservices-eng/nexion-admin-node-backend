const User = require("../model/loginmodel");

const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    const target = await User.findById(userId).select("role username email");
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    if (target.role !== "admin") {
      return res.status(400).json({ message: "Only admin accounts can be deleted from this endpoint" });
    }

    await User.findByIdAndDelete(userId);

    return res.status(200).json({
      message: "Admin deleted successfully",
      user: {
        id: target._id,
        username: target.username,
        email: target.email,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete user", error: error.message });
  }
};

module.exports = deleteUser;
