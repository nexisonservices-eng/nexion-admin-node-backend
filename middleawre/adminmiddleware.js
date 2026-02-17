const jwt = require("jsonwebtoken");

// Temporary hardcoded JWT secret for testing
// In production, this should be properly configured via environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'technova_jwt_secret_key_2024';

const auth = (req, res, next) => {
  try {
    // 1️⃣ Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "No token provided" });
    }

    // Format: "Bearer <token>"
    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Invalid token format" });
    }

    // 2️⃣ Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    // decoded = { userId, email, role }

    // 3️⃣ Save user info in request
    req.user = decoded;

    next(); // pass control to next middleware / route
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "superadmin") {
    return res.status(403).json({ message: "Access denied. Superadmin only." });
  }
  next();
};

module.exports = { auth, requireSuperAdmin };
