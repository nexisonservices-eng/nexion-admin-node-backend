const User = require("../model/loginmodel");

// Delete user by ID
const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    const deletedUser = await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "User deleted successfully",
      user: {
        id: deletedUser._id,
        username: deletedUser.username,
        email: deletedUser.email,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete user", error: error.message });
  }
};

module.exports = deleteUser;
