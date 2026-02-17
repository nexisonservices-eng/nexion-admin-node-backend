const jwt = require("jsonwebtoken");

// Temporary hardcoded JWT secret for testing
// In production, this should be properly configured via environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'technova_jwt_secret_key_2024';

const protect = async (req, res, next) => {
  let token;
  try {
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];

      // Decode token
      const decoded = jwt.verify(token, JWT_SECRET);

      // Attach user to request
      req.user = {
        id: decoded.userId || decoded.id,
        username: decoded.username || null,
        email: decoded.email || null,
        role: decoded.role || null
      };

      if (!req.user.id) {
        return res.status(401).json({ message: "Invalid token payload" });
      }

      next();
    } else {
      return res.status(401).json({ message: "Not authorized" });
    }
  } catch (error) {
    return res.status(401).json({ message: "Token failed", error: error.message });
  }
};

module.exports = protect;
