const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const authHeader = req.header("Authorization");
  // console.log("🔍 Received Authorization Header:", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.error("❌ No token provided or incorrect format");
    return res.status(401).json({ error: "Unauthorized - No token provided" });
  }

  const token = authHeader.replace("Bearer ", "");
  // console.log("✅ Extracted Token:", token);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // console.log("✅ Decoded Token:", decoded);

    req.user = decoded; // Attach decoded user data to `req.user`
    next();
  } catch (error) {
    console.error("❌ JWT Verification Failed:", error.message);
    return res.status(401).json({ error: "Invalid token" });
  }
};
