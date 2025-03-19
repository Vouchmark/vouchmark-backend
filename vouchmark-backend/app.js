require("dotenv").config();
require("express-async-errors");
const cron = require("node-cron");
const express = require("express");
const { error } = require("console");
const path = require("path");
const routes = require("./routes");
const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const errorHandlerMiddleware = require("./error-handler");
const adminRoutes = require("./routes/admin");
const Admin = require("./models/Admin");
const bcrypt = require("bcryptjs");
const visitorRoutes = require("./routes/visitor");

const {
  updateBillVerfied,
  updateCompanyData,
  authMiddleware,
} = require("./helper");
const app = express();

// Replace your current CORS configuration with this more explicit one
app.use((req, res, next) => {
  const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3005",
    "http://localhost:4000",
    "https://admin.vouchmark.com",
    "https://www.admin.vouchmark.com",
    "www.admin.vouchmark.com",
    "https://vouchmark.com",
    "www.vouchmark.com",
    "https://www.vouchmark.com"
  ];

  const origin = req.headers.origin;
  console.log("Request Origin:", origin); // Debugging

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  next();
});

app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  next();
});
app.use(express.json());
app.use(bodyParser.json());
// app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
const port = process.env.PORT || 3000;

// Now define routes after CORS is configured
app.use("/", routes);
// app.use("/search", routes);
// app.use("/search-info", routes);
// app.use("/signup", routes);
// app.use("/verify", routes);
// app.use("/signin", routes);
// app.use("/about", routes);
// app.use("/contact", routes);
// app.use("/reset-password", routes);
// app.use("/terms", routes);
// app.use("/how-it-works", routes);
// app.use("/policy", routes);

// // Authorization api routing
// app.use("/vouch/api/vauth//vouch/api/vauth/google_login", routes);
// app.use("/vouch/api/vauth//vouch/api/vauth/google_signup", routes);
// app.use("/vouch/api/vauth/signup", routes);
// app.use("/vouch/api/vauth/login", routes);
// app.use("/vouch/api/v1/payment/collect_payment", routes);

// // document verification route
// app.use("/verifyBill", routes);
// app.use("/verifyCac", routes);
// app.use("/verifyStatusReport", routes);

// // Lookup API routing
// app.use("/vouch/api/v1/company/company_lookup", routes);

// app.use("/vouch/api/admin", adminRoutes);

// // Routes
// app.use("/vouch/api/visitor", visitorRoutes);

// app.use(errorHandlerMiddleware);
app.use((req, res) => {
    return res.status(404).json({
        status: "Not Found"
    })
});

//Alrwady created
// const createSuperAdmin = async () => {
//   const existingAdmin = await Admin.findOne({ role: "super_admin" });
//   if (!existingAdmin) {
//     const hashedPassword = await bcrypt.hash("Vouchmark2021$", 10); // Change this to a secure password
//     const superAdmin = new Admin({
//       email: "vouchmark23@gmail.com", // Change this to a secure email
//       password: hashedPassword,
//       role: "super_admin",
//     });
//     await superAdmin.save();
//     console.log("Super admin created");
//   } else {
//     console.log("Super admin already exists");
//   }
// };

// Call the function when the server starts
// createSuperAdmin();

// Schedule the job to run every day at midnight
cron.schedule("0 0 * * *", async () => {
  console.log("Running daily company update...");
  await updateCompanyData();
  console.log("done");
});

// Cron job to run at midnight every day
cron.schedule("0 0 * * *", async () => {
  console.log(
    "Running daily check to reset bill verfication and send mail update..."
  );
  await updateBillVerfied();
});

app.listen(port, () => {
  console.log(`Server is running on port http://localhost:${port}`);
});
