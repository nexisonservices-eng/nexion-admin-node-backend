// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const { blacklistedTokens } = require("../controller/logout");

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  // Check if token is blacklisted
  if (blacklistedTokens.includes(token)) {
    return res.status(401).json({ message: "Token is invalid (logged out)" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token invalid or expired" });
  }
};

module.exports = authMiddleware;
