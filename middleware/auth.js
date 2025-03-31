const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  try {
    console.log(`Auth check for ${req.method} ${req.url}`);
    
    // Extract token from different sources
    let token = null;
    
    // 1. Check query parameter (for GET requests that need fallback)
    if (req.query && req.query.token) {
      token = req.query.token;
      console.log('Using token from query parameter');
    } 
    // 2. Check Authorization header (standard approach)
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
      console.log('Using token from Authorization header');
    }
    
    // If no token found in any location
    if (!token) {
      console.log('No token found in request');
      return res.status(401).json({ message: "Authentication failed: No token provided" });
    }
    
    // Verify the token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log(`Token valid for user: ${decoded.id}`);
      req.user = decoded;
      next();
    } catch (tokenError) {
      console.error("Token verification failed:", tokenError.message);
      return res.status(401).json({ message: "Authentication failed: Invalid token" });
    }
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({ message: "Server error during authentication" });
  }
};
