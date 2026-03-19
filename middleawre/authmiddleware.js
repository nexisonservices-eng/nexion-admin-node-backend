const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

const protect = async (req, res, next) => {
  let token;
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET is not configured" });
    }
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
        role: decoded.role || null,
        companyId: decoded.companyId || null,
        companyRole: decoded.companyRole || null,
        planCode: decoded.planCode || null,
        featureFlags: decoded.featureFlags || null,
        subscriptionStatus: decoded.subscriptionStatus || null
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
