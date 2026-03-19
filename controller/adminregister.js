const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../model/loginmodel");

const registerAdmin = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      const hashedPassword = await bcrypt.hash(password, 10);
      existingUser.username = username || existingUser.username;
      existingUser.password = hashedPassword;
      existingUser.role = "admin";
      await existingUser.save();

      const token = jwt.sign(
        { userId: existingUser._id, email: existingUser.email, role: existingUser.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      return res.status(200).json({
        message: "Existing user promoted to admin",
        token,
        user: {
          id: existingUser._id,
          username: existingUser.username,
          email: existingUser.email,
          role: existingUser.role,
        },
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: "admin",
    });

    await newUser.save();

    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      message: "Admin registered successfully",
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { registerAdmin };
