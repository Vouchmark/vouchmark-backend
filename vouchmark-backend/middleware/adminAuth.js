const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const adminAuthMiddleware = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1]; // Get token from Authorization header

  if (!token) {
    return res.status(403).json({ error: "Access denied" });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "Invalid token" });
    }

    const admin = await Admin.findById(decoded.adminId);
    if (!admin) {
      return res.status(403).json({ error: "Access denied" });
    }

    req.admin = admin; // Attach admin to request
    next();
  });
};

module.exports = adminAuthMiddleware;
