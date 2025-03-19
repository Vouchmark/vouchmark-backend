const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const adminAuthMiddleware = require("../middleware/adminAuth");
const { User, Company, Payment, ActivePlan, Search } = require("../model");
const Admin = require("../models/Admin");
const { sendNotification } = require("../helper");
const url = "https://vouchmark.com";
const admin_url = "https://admin.vouchmark.com";
const mongoose = require("mongoose");
const Visitor = require("../models/Visitor");

// Admin Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res
        .status(401)
        .json({ error: "Invalid credentials", status: "false" });
    }

    if (!(await bcrypt.compare(password, admin.password))) {
      return res
        .status(401)
        .json({ error: "Invalid credentials", status: "false" });
    }

    const token = jwt.sign({ adminId: admin._id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });
    res.cookie("adminToken", token, { httpOnly: true });

    if (!admin.isActive) {
      return res.status(200).json({
        error: "Account is inactive. Please reset your password.",
        token,
        status: "inactive",
      });
    }

    const adminResponse = admin.toObject();
    adminResponse.id = adminResponse._id;
    delete adminResponse._id;
    delete adminResponse.__v;
    delete adminResponse.password;

    res.json({
      message: "Login successful",
      admin: adminResponse,
      token,
      status: "true",
    });
  } catch (error) {
    res.status(500).json({ error: "Server error", status: "false" });
  }
});

// Dashboard Statistics
router.get("/dashboard/stats", adminAuthMiddleware, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeCompanies = await Company.countDocuments({ active: true });

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyRevenueResult = await Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    const monthlyRevenue = monthlyRevenueResult[0]?.total || 0;

    const searchVolume = await Search.countDocuments({
      searchDate: { $gte: startOfMonth },
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const uniqueVisitorStats = await Visitor.aggregate([
      {
        $match: {
          timestamp: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            visitorId: "$visitorId",
          },
        },
      },
      {
        $group: {
          _id: "$_id.date",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    const uniqueVisitors = uniqueVisitorStats.map((item) => ({
      date: item._id,
      count: item.count,
    }));

    const visitorsByDeviceRaw = await Visitor.aggregate([
      {
        $match: {
          timestamp: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: "$device",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    const visitorsByDevice = visitorsByDeviceRaw.map((item) => ({
      device: item._id || "Unknown",
      count: item.count,
    }));

    const monthlyRevenueOverview = await Payment.aggregate([
      {
        $match: {
          createdAt: { $ne: null },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          total: { $sum: "$amount" },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    const formattedRevenueOverview = monthlyRevenueOverview.map((item) => {
      const [year, month] = item._id.split("-");
      return {
        year: year,
        month: month,
        total: item.total / 100,
      };
    });

    res.json({
      totalUsers,
      activeCompanies,
      monthlyRevenue,
      searchVolume,
      uniqueVisitors,
      visitorsByDevice,
      monthlyRevenueOverview: formattedRevenueOverview,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Server error" });
  }
});

// Users List with Pagination
router.get("/users", adminAuthMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const users = await User.find()
      .select("-password -free_trial -_id -__v")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments();

    res.json({
      users,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: page,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Companies List with Pagination
router.get("/companies", adminAuthMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Check for the claimed query parameter
    const claimedParam = req.query.claimed; // e.g., ?claimed=true or ?claimed=false
    const filter = {};

    if (claimedParam) {
      // Adjust the filter based on the query param
      if (claimedParam === "true") {
        filter.ownerId = { $nin: [null, ""] };
        // Filter for claimed companies (not null and not empty)
      } else if (claimedParam === "false") {
        filter.ownerId = null; // Filter for unclaimed companies
      }
    }

    const companies = await Company.aggregate([
      {
        $match: filter, // Apply the filter for claimed status
      },
      {
        $lookup: {
          from: "users",
          localField: "ownerId",
          foreignField: "userId",
          as: "ownerInfo",
        },
      },
      {
        $unwind: {
          path: "$ownerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          id: 1,
          companyName: 1,
          rcNumber: 1,
          active: 1,
          view_count: 1,
          vouchmark_tools: 1,
          address: 1,
          ownerId: 1,
          ownerInfo: {
            name: "$ownerInfo.name",
            email: "$ownerInfo.email",
          },
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
      {
        $sort: { createdAt: -1 },
      },
    ]);

    const total = await Company.countDocuments(filter); // Count based on the filter

    res.json({
      companies,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: page,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Subscription/Payment History
router.get("/subscriptions", adminAuthMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const subscriptions = await Payment.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "userId",
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
      {
        $project: {
          amount: 1,
          plan: 1,
          referenceNumber: 1,
          datePaid: 1,
          createdAt: 1,
          email: 1,
          userId: 1,
          "user.name": 1,
          "user.email": 1,
        },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
      {
        $sort: { createdAt: -1 },
      },
    ]);

    const total = await Payment.countDocuments();

    res.json({
      subscriptions,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: page,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Total Revenue and Average Transaction per Day
router.get("/revenue", adminAuthMiddleware, async (req, res) => {
  try {
    const totalRevenueResult = await Payment.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
        },
      },
    ]);

    const totalRevenue = (totalRevenueResult[0]?.totalRevenue || 0) / 100;

    const averageTransactionResult = await Payment.aggregate([
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          dailyTotal: { $sum: "$amount" },
        },
      },
      {
        $group: {
          _id: null,
          averageTransaction: { $avg: "$dailyTotal" },
        },
      },
    ]);

    const averageTransaction =
      (averageTransactionResult[0]?.averageTransaction || 0) / 100;

    res.json({
      totalRevenue,
      averageTransaction,
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Send Invite
router.post("/invite", adminAuthMiddleware, async (req, res) => {
  const { email, role, fullName } = req.body;

  const existingAdmin = await Admin.findOne({ email });
  if (existingAdmin) {
    return res
      .status(400)
      .json({ error: "An admin with this email already exists." });
  }

  const defaultPassword = "Adminpassword";
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);

  const newAdmin = new Admin({
    email,
    password: hashedPassword,
    role,
    fullName,
    isActive: false,
  });

  await newAdmin.save();

  const token = jwt.sign({ email }, process.env.JWT_SECRET, {
    expiresIn: "24h",
  });

  const inviteLink = `${admin_url}/accept-invite?token=${token}`;

  const { message, status } = await sendNotification(
    `${inviteLink}`,
    email,
    "sendAdminInvite"
  );
  console.log(message, status);

  res.json({ message: `Invite sent to ${email}` });
});

// Accept Invite
router.post("/accept-invite", async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res
      .status(400)
      .json({ error: "Token and new password are required" });
  }

  let email;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    email = decoded.email;
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }

  const admin = await Admin.findOne({ email });

  if (!admin) {
    return res.status(404).json({ error: "Admin not found" });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  admin.password = hashedPassword;
  admin.isActive = true;
  await admin.save();

  res.json({ message: "Your account has been activated" });
});

// Get All Admin Team Users
router.get("/admins", adminAuthMiddleware, async (req, res) => {
  try {
    const admins = await Admin.find({}).select("-password -__v"); // Exclude sensitive fields

    res.json({
      admins,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get Company Details by ID
router.get("/companies/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const company = await Company.aggregate([
      {
        $match: { id: id },
      },
      {
        $lookup: {
          from: "users",
          localField: "ownerId",
          foreignField: "userId",
          as: "ownerInfo",
        },
      },
      {
        $unwind: {
          path: "$ownerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          "ownerInfo.password": 0,
          "ownerInfo.__v": 0,
        },
      },
    ]);

    if (!company.length) {
      return res.status(404).json({ error: "Company not found" });
    }

    res.json(company[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/update-password", adminAuthMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const adminId = req.admin._id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: "All fields are required",
        status: "false",
      });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        error: "Admin not found",
        status: "false",
      });
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      admin.password
    );
    if (!isPasswordValid) {
      return res.status(401).json({
        error: "Current password is incorrect",
        status: "false",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;
    await admin.save();

    res.json({
      message: "Password updated successfully",
      status: "true",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Server error",
      status: "false",
    });
  }
});

// Remove Admin
router.delete("/admins/:id", adminAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const requestingAdmin = req.admin;

    if (requestingAdmin.role !== "super_admin") {
      return res.status(403).json({
        error: "Only super admins can remove other admins",
        status: "false",
      });
    }

    const adminToDelete = await Admin.findById(id);
    if (!adminToDelete) {
      return res.status(404).json({
        error: "Admin not found",
        status: "false",
      });
    }

    if (adminToDelete.role === "super_admin") {
      return res.status(403).json({
        error: "Super admin cannot be deleted",
        status: "false",
      });
    }

    await Admin.findByIdAndDelete(id);

    res.json({
      message: "Admin removed successfully",
      status: "true",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Server error",
      status: "false",
    });
  }
});

// Update Admin Role
router.put("/admins/:id/role", adminAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const requestingAdmin = req.admin;

    const validRoles = ["admin", "moderator", "customer_support"];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({
        error:
          "Invalid role. Role must be one of: admin, moderator, customer_support",
        status: "false",
      });
    }

    if (requestingAdmin.role !== "super_admin") {
      return res.status(403).json({
        error: "Only super admins can update admin roles",
        status: "false",
      });
    }

    const adminToUpdate = await Admin.findById(id);
    if (!adminToUpdate) {
      return res.status(404).json({
        error: "Admin not found",
        status: "false",
      });
    }

    if (adminToUpdate.role === "super_admin") {
      return res.status(403).json({
        error: "Super admin role cannot be changed",
        status: "false",
      });
    }

    adminToUpdate.role = role;
    await adminToUpdate.save();

    const updatedAdmin = adminToUpdate.toObject();
    updatedAdmin.id = updatedAdmin._id;
    delete updatedAdmin._id;
    delete updatedAdmin.__v;
    delete updatedAdmin.password;

    res.json({
      message: "Admin role updated successfully",
      admin: updatedAdmin,
      status: "true",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Server error",
      status: "false",
    });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: "Email is required",
        status: "false",
      });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({
        error: "No account found with this email",
        status: "false",
      });
    }

    const token = jwt.sign(
      { email, adminId: admin._id },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    const resetLink = `${admin_url}/reset-password?token=${token}`;

    const { message, status } = await sendNotification(
      `${resetLink}`,
      email,
      "sendAdminPasswordReset"
    );

    res.json({
      message: "Password reset link sent to your email",
      status: "true",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Server error",
      status: "false",
    });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        error: "Token and new password are required",
        status: "false",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(403).json({
        error: "Invalid or expired token",
        status: "false",
      });
    }

    const admin = await Admin.findOne({ email: decoded.email });
    if (!admin) {
      return res.status(404).json({
        error: "Admin not found",
        status: "false",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;
    admin.isActive = true;
    await admin.save();

    res.json({
      message: "Password has been reset successfully",
      status: "true",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Server error",
      status: "false",
    });
  }
});

module.exports = router;
