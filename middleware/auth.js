const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  try {
    // Check for token in query params (for fallback approach)
    if (req.query && req.query.token) {
      const token = req.query.token;
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      console.log('Authenticated via query token');
      return next();
    }
    
    // Check for token in headers (standard approach)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: "Authentication failed: No token provided" });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ message: "Authentication failed: Invalid token" });
  }
};
