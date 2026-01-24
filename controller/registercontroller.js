const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../model/loginmodel");

const registeruser = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: "user",
      createdBy: null,
      createdByName: null,
    });

    await newUser.save();

    const token = jwt.sign(
      { userId: newUser._id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
       role: newUser.role,
      message: "User registered successfully",
      token,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { registeruser };
