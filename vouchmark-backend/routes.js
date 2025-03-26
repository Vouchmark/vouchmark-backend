require("dotenv").config();
require("express-async-errors");
const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { URL } = require("url");
const path = require("path");
const dns = require("dns").promises;
const fs = require("fs");
const QRCodeReader = require("qrcode-reader");
const { Jimp } = require("jimp");
const FormData = require("form-data"); // Import the correct FormData package

const url = "https://vouchmark.com";
// const address_main_url = "http://localhost:4009";
const address_main_url = "https://vouchmark.com";

// const url = "http://localhost:3005";

const { GoogleAIFileManager } = require("@google/generative-ai/server");
const {
  HarmBlockThreshold,
  HarmCategory,
  GoogleGenerativeAI,
  SchemaType,
} = require("@google/generative-ai");

const multer = require("multer");
// Define storage settings for Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "uploads"); // Specify your uploads directory path

    // Ensure the upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Specify the destination folder for uploads
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Extract the file extension from the original name
    const ext = path.extname(file.originalname);

    // Generate a unique file name and append the correct extension
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

// Initialize the upload middleware
const upload = multer({ storage: storage });

const cloudinary = require("cloudinary").v2;
// Configure Cloudinary with your credentials
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

// Function to upload a file to Cloudinary
const uploadFileToCloudinary = async (filePath, folder, publicId) => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      public_id: publicId,
      display_name: publicId,
      overwrite: true,
    });
    console.log(result);
    return result.secure_url;
  } catch (err) {
    if (err.http_code === 409) {
      console.log(
        `File with public_id ${publicId} already exists. Skipping upload.`
      );
      const existingFile = await cloudinary.api.resource(publicId);
      return existingFile.secure_url;
    } else {
      console.error(`File upload failed for ${publicId}:`, err);
      return null;
    }
  }
};

const MONO_SECRET_KEY = process.env.MONO_SECRET_KEY; // Replace with your Mono Secret Key
const MONO_API_KEY = process.env.MONO_API_KEY;
const secret = process.env.MONO_WEBHOOK_SEC;
const publicKey = process.env.PUBLIC_KEY;
const DB_KEY = process.env.DB_KEY;

var admin = require("firebase-admin");

var serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://vouchmark-412cc-default-rtdb.firebaseio.com",
});

const MONO_API_URL = "https://api.withmono.com";
const {
  authMiddleware,
  verifyEmailMiddleware,
  paymentBlockRoute,
  checkAuthMiddleware,
  generateCompanyPDF,
  maskEmail,
  maskPhoneNumber,
  maskAddress,
  forClaimUsers,
  formatDate,
  sendNotification,
  email_url,
} = require("./helper");
const { StatusCodes } = require("http-status-codes");

let mailCompany = {};
let phoneCompany = {};
let pinId = {};

const {
  User,
  Company,
  NewsletterSubscriber,
  Payment,
  ActivePlan,
  Search,
  PaidCompanyView,
} = require("./model");
const { error } = require("console");

const app = express();

//Page Routing API

// app.get("/search-info", (req, res) => {
//   res.sendFile(__dirname + "/public/search-info.html");
// });

// app.get("/search", (req, res) => {
//   res.sendFile(__dirname + "/public/search.html");
// });
// app.get("/company", authMiddleware, paymentBlockRoute, (req, res) => {
//   res.sendFile(__dirname + "/public/full-search.html");
// });

// app.get("/signin", (req, res) => {
//   const token = req.cookies?.token;

//   if (token) {
//     return res.redirect(`/dashboard`);
//   }

//   res.sendFile(__dirname + "/public/signin.html");
// });
// app.get("/verify", (req, res) => {
//   res.sendFile(__dirname + "/public/otp.html");
// });
// app.get("/logout", (req, res) => {
//   res.clearCookie("token");
//   res.redirect("/signin");
// });

// app.get("/signup", (req, res) => {
//   const token = req.cookies?.token;

//   if (token) {
//     return res.redirect(`/dashboard`);
//   }

//   res.sendFile(__dirname + "/public/signup.html");
// });
// app.get("/about", (req, res) => {
//   res.sendFile(__dirname + "/public/about.html");
// });
// app.get("/contact", (req, res) => {
//   res.sendFile(__dirname + "/public/contact.html");
// });
// app.get("/reset-password", (req, res) => {
//   res.sendFile(__dirname + "/public/reset-password.html");
// });
// app.get("/terms", (req, res) => {
//   res.sendFile(__dirname + "/public/terms.html");
// });
// app.get("/how-it-works", (req, res) => {
//   res.sendFile(__dirname + "/public/learn-more.html");
// });
// app.get("/policy", (req, res) => {
//   res.sendFile(__dirname + "/public/policy.html");
// });

// Backend: Define a route to check if a user is logged in
app.get("/isLoggedIn", checkAuthMiddleware, (req, res) => {
  // If checkAuthMiddleware passes, the user is authenticated
  console.log(req.userId);
  if (req.userId) {
    return res.json({ loggedIn: true });
  } else {
    return res.json({ loggedIn: false });
  }
});

//USER DASHBOARD ROUTING
app.get("/dashboard", authMiddleware, async (req, res) => {
  try {
    const { userId } = req;

    // Fetch user companies and only the necessary fields (ownerId, view_count)
    const user_company = await Company.findOne({ ownerId: userId });

    const name = await Company.collection.name;
    // const search_histories = await Search.find({ userId: userId }).sort({ searchDate: -1 }).populate('compnayId', 'companyName rcNumber active');
    const search_histories = await Search.aggregate([
      { $match: { userId: userId } },
      {
        $lookup: {
          from: Company.collection.name, // Collection name in MongoDB
          localField: "companyId",
          foreignField: "id",
          as: "companyDetails",
        },
      },
      {
        $unwind: {
          path: "$companyDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          userId: 1, // Include userId from the Search collection
          companyId: 1,
          searchDate: 1,
          companyDetails: {
            id: 1,
            companyName: 1,
            rcNumber: 1,
            active: 1,
          },
        },
      },
      {
        $sort: {
          searchDate: -1, // Sort by searchDate in descending order
        },
      },
    ]).exec();

    const search_count = search_histories.length;
    const paidCompanyDetails = await PaidCompanyView.aggregate([
      { $match: { userId: userId } },
      {
        $lookup: {
          from: Company.collection.name, // Collection name in MongoDB
          localField: "companyId",
          foreignField: "id",
          as: "companyDetails",
        },
      },
      {
        $unwind: {
          path: "$companyDetails",
          preserveNullAndEmptyArrays: true,
        },
      },
    ]).exec();

    const currentDate = new Date();
    const activePlan = await ActivePlan.findOne({
      userId,
      start_date: { $lte: currentDate },
      end_date: { $gte: currentDate },
    });

    const user = await User.findOne({ userId, userId });

    let vouchmark_details;
    if (user_company) {
      const company_details = {
        rcNumber: user_company.rcNumber,
        cacert_verified: user_company.cacert_verified,
        cacreport_verified: user_company.cacreport_verified,
        firstaxClearance_vr: user_company.firstaxClearance_vr,
        bill_verfied: user_company.bill_verfied,
        website_verified: user_company.website_verified,
        bank_account_id: user_company.owner_bank_id,
        shareHolderVerified: user_company.shareHolderVerified,
        facebook: user_company.facebook,
        instagram: user_company.instagram,
        twitter: user_company.twitter,
        website: user_company.website,
        tiktok: user_company.tiktok,
        linkedin: user_company.linkedin,
      };

      vouchmark_details = await getVouchMark(company_details, userId);
    }

    if (activePlan) {
      activePlan["endDate"] = formatDate(activePlan?.end_date);
    }

    let vouchmarkDescription;

    if (user_company?.vouchmark_tools.vouch_mark >= 300) {
      vouchmarkDescription = "Excellent";
    } else if (user_company?.vouchmark_tools.vouch_mark >= 250) {
      vouchmarkDescription = "Very Good";
    } else if (user_company?.vouchmark_tools.vouch_mark >= 200) {
      vouchmarkDescription = "Good";
    } else if (user_company?.vouchmark_tools.vouch_mark >= 150) {
      vouchmarkDescription = "Fair";
    } else {
      vouchmarkDescription = "Poor";
    }
    console.log(activePlan);
    console.log(vouchmarkDescription);

    // Get the start of the current day (midnight) to ensure searches are counted for the day
    const startOfDay = new Date(currentDate.setHours(0, 0, 0, 0));

    const paidSearchesToday = await PaidCompanyView.find({
      userId: userId,
      viewDate: { $gte: startOfDay },
    }).distinct("companyId");

    return res.status(200).json({
      user,
      user_company,
      vouchmarkDescription,
      activePlan,
      detailedSearchesDone: paidSearchesToday.length,
      vouchmark: vouchmark_details?.vouch_mark,
      search_histories: search_histories.map((detail) => ({
        ...detail,
        formattedViewDate: formatDate(detail.searchDate),
      })),
      search_count,
      paidCompanyDetails: paidCompanyDetails.map((detail) => ({
        ...detail,
        formattedViewDate: formatDate(detail.viewDate),
      })),
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    // send proper page
    return res.status(500).send("Internal Server Error");
  }
});

app.get("/dashboard/account", authMiddleware, async (req, res) => {
  const { userId } = req;
  const user = await User.findOne({ userId: userId });
  const user_company = await Company.findOne({ ownerId: userId });
  res.status(200).json({ user, user_company });
});

app.get("/dashboard/address", authMiddleware, async (req, res) => {
  const { userId } = req;
  const company = await Company.findOne({ ownerId: userId });
  const user_company = await Company.findOne({ ownerId: userId });
  if (!company) {
    return res.status(404).json({ message: "Company not found" });
  }
  res.status(200).json({ company, user_company });
});

app.get("/dashboard/bank", authMiddleware, async (req, res) => {
  const { userId } = req;
  const company = await Company.findOne({ ownerId: userId });
  const user_company = await Company.findOne({ ownerId: userId });
  if (!company) {
    return res.status(404).json({ message: "Company not found" });
  }
  res.status(200).json({ company, user_company });
});

app.get("/dashboard/cac", authMiddleware, async (req, res) => {
  const { userId } = req;
  const company = await Company.findOne({ ownerId: userId });

  const user_company = await Company.findOne({ ownerId: userId });
  if (!company) {
    return res.status(404).json({ message: "Company not found" });
  };
  res.status(200).json({ company, user_company });
});

app.get("/dashboard/owner", authMiddleware, async (req, res) => {
  const { userId } = req;
  const company = await Company.findOne({ ownerId: userId });
  if (!company) {
    return res.status(404).json({ message: "Company not found" });
  }
  console.log(company);
  res.status(200).json({ company, user_company: company });
});

app.get("/dashboard/social", authMiddleware, async (req, res) => {
  const { userId } = req;
  const company = await Company.findOne({ ownerId: userId });

  const user_company = await Company.findOne({ ownerId: userId });

  if (!company) {
    return res.status(404).json({ message: "Company not found" });
  }
  res.status(200).json({ company, user_company });
});

app.get("/dashboard/tin", authMiddleware, async (req, res) => {
  const { userId } = req;
  const company = await Company.findOne({ ownerId: userId });

  if (!company) {
    return res.status(404).json({ message: "Company not found" });
  }
  console.log(company);
  res.status(200).json({ company, user_company: company });
});

app.get("/dashboard/my-companies", authMiddleware, async (req, res) => {
  const { userId } = req;
  const myCompanies = await Company.find({ ownerId: userId });

  res.status(200).json({ myCompanies });
});

app.get(
  "/dashboard/payment",
  authMiddleware,
  async (req, res) => {
    const { userId } = req;
    const billings = await Payment.find({ userId: userId }).sort({
      createdAt: -1,
    });
    const activeplan = await ActivePlan.findOne({ userId: userId });
    let formattedActivePlan;
    if (activeplan) {
      formattedActivePlan = {
        ...activeplan._doc, // Spread the original activeplan data
        start_date: formatDate(activeplan.start_date), // Format the start_date
        end_date: formatDate(activeplan.end_date), // Format the end_date (if applicable)
      };
    }

    // console.log(billings)
    const user = await User.findOne({ userId: userId }, { purpose: 1 });
    const user_company = await Company.findOne({ ownerId: userId });

    res.status(200).json({
      billings: billings.map((detail) => {
        console.log(detail);
        return {
          ...detail,
          referenceNumber: detail.referenceNumber,
          userId: detail.userId,
          amount: (detail.amount / 100).toLocaleString(),
          plan: detail.plan,
          date: formatDate(detail.start_date),
          endDate: formatDate(detail.end_date),
          email: detail.email,
        };
      }),
      user,
      activeplan: formattedActivePlan,
      user_company,
    });
  }
);

app.get("/dashboard/claim-company", authMiddleware, async (req, res) => {
  const { query } = req.query;
  const { userId } = req;

  let error = "";
  if (!query) {
    return res.status(200).json({ companies: [], query });
  }

  const data = await companyLookup(query, userId);
  if (data.message == "No record found.") {
    return res.status(200).json({ companies: [], query });
  }

  res.status(200).json({ companies: data.companies, query });
});


app.get("/dashboard/company-details", authMiddleware, async (req, res) => {
  // user must be the owner
  const { userId } = req;

  const company = await Company.findOne({ ownerId: userId });
  if (!company) {
    return res.status(404).json({ message: "Company not found" });
  }
  res.status(200).json({
    company: company,
    user_company: company,
  });
});
-
// Authorization API
app.post("/vouch/api/vauth/signup", async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;
  console.log(req.body);
  if (password !== confirmPassword) {
    return res.json({ message: "Password Must match" });
  }
  const timestampid = Date.now().toString() + req.body.email.split("@")[0];
  console.log(timestampid);
  const nEmail = email.toLowerCase();
  const newUser = new User({
    userId: timestampid,
    name,
    email: nEmail,
    authMode: "email",
    verfiedEmail: false,
    password,
  });

  try {
    const existingUser = await User.findOne({ email: nEmail });

    if (existingUser) {
      return res.json({ message: "Email already exists" });
    } else {
      await newUser.save();
      const token = await jwt.sign(
        { userId: newUser.userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_LIFETIME }
      );
      res.cookie("token", token, { httpOnly: true });
      return res
        .status(201)
        .json({ message: "User created successfully", userId: timestampid, token: token });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/vouch/api/vauth/google_signup", async (req, res) => {
  try {
    const { token } = req.body;

    // Verify the ID token using Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(token);
    const email = decodedToken.email;
    const name = decodedToken.name;
    if (!email || !name) {
      return res.status(400).json({ message: "User details not found" });
    }

    const timestampid = Date.now().toString() + email.split("@")[0];
    const newUser = new User({
      userId: timestampid,
      name,
      email,
      authMode: "google",
      verfiedEmail: false,
      purpose: "search",
    });

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.json({ message: "Email Already exist" });
    }
    await newUser.save();
    const token_ = await jwt.sign(
      { userId: newUser.userId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_LIFETIME }
    );
    res.cookie("token", token_, { httpOnly: true });
    res
      .status(201)
      .json({ message: "User created successfully", userId: timestampid, token: token_ });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/vouch/api/vauth/google_login", async (req, res) => {
  try {
    const { token } = req.body;
    // Verify the ID token using Firebase Admin SDK
    const decodedToken = await admin.auth().verifyIdToken(token);
    const email = decodedToken.email;

    const user = await User.findOne({
      email: email,
      authMode: "google",
    });
    if (user) {
      const token = await jwt.sign(
        { userId: user.userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_LIFETIME }
      );
      res.cookie("token", token, { httpOnly: true });
      res
        .status(200)
        .json({ message: "Login Successful", userId: user.userId, token: token });
    } else {
      res.json({ message: "Invalid email or password" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/vouch/api/vauth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({
      email: email,
    });
    console.log(user);

    if (!user) {
      return res.json({ message: "Invalid email or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = await jwt.sign(
      { userId: user.userId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_LIFETIME }
    );
    res.cookie("token", token, { httpOnly: true });
    return res
      .status(200)
      .json({ message: "Login Successful", userId: user.userId, token: token });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

const companyLookup = async (searchTerm, userId) => {
  // Escape special regex characters in searchTerm
  console.log(searchTerm);
  const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  console.log(escapedSearchTerm);

  // Check if any company with companyName containing the searchTerm in the database
  const existingCompanies = await Company.find(
    {
      companyName: { $regex: escapedSearchTerm, $options: "i" },
    },
    {
      companyName: 1,
      id: 1,
      active: 1,
      address: 1,
      email: 1,
      vouchEmail: 1,
      "registrarInfo.email": 1,
      registrationDate: 1,
      state: 1,
      lga: 1,
      rcNumber: 1,
    }
  );

  if (existingCompanies.length > 0) {
    console.log(true);
    // Increment search_view_count for each found company
    const bulkOpsForExisting = existingCompanies.map((company) => ({
      updateOne: {
        filter: { id: company.id },
        update: { $inc: { search_view_count: 1 } }, // Increment the count
        upsert: true,
      },
    }));
    await Company.bulkWrite(bulkOpsForExisting);

    // Log search history for found companies
    if (userId) {
      const searchHistory = existingCompanies.map((company) => ({
        companyId: company.id,
        userId: userId,
        searchDate: new Date(),
      }));

      await Search.insertMany(searchHistory); // Efficient bulk insert of search history
    }
    return {
      message: "Companies found in database.",
      companies: existingCompanies.map((company) => ({
        ...company.toObject(), // Spread the existing fields
        email: company.email ? maskEmail(company.email) : null, // Mask the email address
        address: company.address ? maskAddress(company.address) : null, // Mask the address
      })),
    };
  } else {
    console.log(false);

    const options = {
      method: "POST",
      url: "https://postapp.cac.gov.ng/postapp/api/front-office/search/company-business-name-it",
      headers: {
        Accept: "*/*",
        Referer: "https://post.cac.gov.ng/",
        "Content-Type": "application/json",
      },
      data: { searchTerm: searchTerm },
    };

    try {
      const response = await axios.request(options);
      const companies = response.data.data;
      if (!companies) {
        console.log("Not found");
        return { message: "No record found." };
      }
      console.log(companies);
      console.log(companies[0].rcNumber);
      console.log(companies[0].id);

      const bulkOps = companies.map((company) => ({
        updateOne: {
          filter: { id: company.id }, // Assuming 'id' is the unique identifier
          update: {
            $set: {
              companyName: company.approvedName || null,
              businessCommencementDate:
                company.businessCommencementDate || null,
              registrationDate: company.registrationDate || null,
              registrationApproved: company.registrationApproved || null,
              rcNumber: company.rcNumber || null,
              email: company.email || null,
              address: company.address || null,
              active: company.active || null,
              city: company.city || null,
              lga: company.lga || null,
              state: company.state || null,
            },
            $inc: {
              search_view_count: 1, // Increment the `search_view_count` by 1
            },
          },
          upsert: true, // This ensures no duplicates are created
        },
      }));

      // Execute bulk operations
      await Company.bulkWrite(bulkOps);

      // Fetch the saved companies to return as response
      const savedCompanies = await Company.find(
        {
          id: { $in: companies.map((company) => company.id) },
        },
        {
          companyName: 1,
          id: 1,
          active: 1,
          address: 1,
          email: 1,
          registrationDate: 1,
          state: 1,
          lga: 1,
          rcNumber: 1,
        }
      );

      if (userId) {
        // Add to search history for each company
        const searchHistory = savedCompanies.map((company) => ({
          companyId: company.id,
          userId: userId,
          searchDate: new Date(),
        }));

        await Search.insertMany(searchHistory); // Efficient bulk insert of search history
      }

      return {
        message: "success",
        companies: savedCompanies.map((company) => ({
          ...company.toObject(), // Spread the existing fields
          email: company.email ? maskEmail(company.email) : null, // Mask the email address
          address: company.address ? maskAddress(company.address) : null, // Mask the address
        })),
      };
    } catch (error) {
      console.error(error);
      throw new Error("Internal server error");
    }
  }
};

app.post(
  "/vouch/api/v1/company/company_lookup",
  checkAuthMiddleware,
  // verifyEmailMiddleware,
  async (req, res) => {
    const { searchTerm } = req.body;
    const { userId } = req;

    if (!searchTerm) {
      return res.status(400).json({ error: "searchTerm is required" });
    }

    const data = await companyLookup(searchTerm, userId);
    console.log(data);

    if (data.message == "No record found") {
      return res.status(404).json({ message: "No record found" });
    }

    return res.status(200).json(data);
  }
);

app.get(
  "/vouch/api/v1/get-account/:company_id",
  authMiddleware,
  // verifyEmailMiddleware,
  async (req, res) => {
    const { company_id } = req.params;
    const { userId } = req;

    try {
      const company = await Company.findOne({
        id: company_id,
        ownerId: userId,
      });
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }

      const options = {
        method: "GET",
        url: `https://api.withmono.com/v2/accounts/${company.owner_bank_id}`,
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          "mono-sec-key": MONO_SECRET_KEY, // Replace with your actual key
        },
      };

      const response = await axios(options);
      console.log(response.data);
      if (response.data.status === "successful") {
        return res.status(200).json({
          message: `Successfully Gotten bank account details for ${company_id}`,
          data: response.data,
        });
      } else {
        return res
          .status(404)
          .json({ message: `Account Details for ${company_id} not Found` });
      }
    } catch (error) {
      console.error(
        "Error:",
        error.response ? error.response.data : error.message
      );
      return res.status(500).json({
        error: `Error occured getting Account details for ${company_id}.`,
      });
    }
  }
);
app.get(
  "/vouch/api/v1/get-transactions/:company_id",
  authMiddleware,
  // verifyEmailMiddleware,
  async (req, res) => {
    //
    const { company_id } = req.params;
    const { userId } = req;

    try {
      const company = await Company.findOne({
        id: company_id,
        ownerId: userId,
      });
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }

      const options = {
        method: "GET",
        url: `https://api.withmono.com/v2/accounts/${company.owner_bank_id}/transactions`,
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          "mono-sec-key": MONO_SECRET_KEY, // Replace with your actual key
        },
      };

      const response = await axios(options);
      console.log(response.data);
      if (response.data.status === "successful") {
        return res.status(200).json({
          message: `Successfully Gotten bank transactions details for ${company_id}`,
          data: response.data,
        });
      } else {
        return res
          .status(404)
          .json({ message: `Bank Transactions for ${company_id} not Found` });
      }
    } catch (error) {
      console.error(
        "Error:",
        error.response ? error.response.data : error.message
      );
      return res.status(500).json({
        error: `Error occured getting Bank Transactions for ${company_id}.`,
      });
    }
  }
);

const calculateAccountVrScore = async (bank_account_id) => {
  let bvn_score = (account_present_score = balance_score = 0);
  try {
    const options = {
      method: "GET",
      url: `https://api.withmono.com/v2/accounts/${bank_account_id}`,
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        "mono-sec-key": MONO_SECRET_KEY, // Replace with your actual key
      },
    };

    const response = await axios(options);
    console.log("Account details: ", response.data);
    if (response.data.status === "successful") {
      if (response.data?.data?.account?.balance) {
        balance_score = 10;
      }
      if (response.data?.data?.meta?.data_status == "AVAILABLE") {
        account_present_score = 10;
      }
      if (response.data?.data?.account?.bvn) {
        bvn_score = 20;
      }
    }
  } catch (error) {
    console.log(error);
    console.error(
      `Error occured getting Account details for ${bank_account_id}:: `,
      error.response ? error.response.data : error.message
    );
  }

  return { bvn_score, account_present_score, balance_score };
};

const calculateTransactionVrScore = async (bank_account_id) => {
  let transactions_score = (monthlyTranScore = totalTranScore = 0);
  let active = false;
  try {
    const options = {
      method: "GET",
      url: `https://api.withmono.com/v2/accounts/${bank_account_id}/transactions?paginate=false`,
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        "mono-sec-key": MONO_SECRET_KEY, // Replace with your actual key
      },
    };

    const response = await axios(options);
    console.log("Account transactions: ", response.data);
    if (response.data.status === "successful") {
      // check for transaction with last 3months and total trandactions
      const transactions = response.data.data;
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const recentTransactions = transactions.filter((transaction) => {
        const transactionDate = new Date(transaction.date);
        return transactionDate >= threeMonthsAgo;
      });

      if (recentTransactions.length >= 100) {
        monthlyTranScore = 10;
        active = true;
      }
      if (response.data.meta.total >= 500) totalTranScore = 20;

      console.log(
        `Transactions in last 3 months: ${recentTransactions.length}`
      );
    }

    console.log(monthlyTranScore, totalTranScore);
    transactions_score = monthlyTranScore + totalTranScore;
  } catch (error) {
    console.log(error);
    console.error(
      `Error occured getting Bank Transactions for ${bank_account_id}::  `,
      error.response ? error.response.data : error.message
    );
  }

  return { transactions_score, active };
};

// get VouchMark
const getVouchMark = async (company_details, userId) => {
  let rc_no = (bank_vr = tin = loc = web_ver = owner_ver = 0);
  let social_verified = false;
  if (company_details.cacert_verified && company_details.cacreport_verified)
    rc_no = 45;
  // if (company_details.rcNumber) rc_no = 45;
  if (company_details.bill_verfied) loc = 80;
  // if (company_details.firstin_vr) tin = 350;
  if (company_details.firstaxClearance_vr) tin = 100;
  if (company_details.bank_account_id) bank_vr = 100;
  let social_score = 0;
  if (company_details.facebook) social_score += 1;
  if (company_details.instagram) social_score += 1;
  if (company_details.twitter) social_score += 1;
  if (company_details.linkedin) social_score += 1;
  if (company_details.website) social_score += 1;
  if (company_details.tiktok) social_score += 1;

  if (company_details.website_verified && social_score >= 2) {
    social_verified = true;
    web_ver = 15;
  } // later seperate to present and secure
  if (company_details.shareHolderVerified) owner_ver = 60;

  let vouch_mark = rc_no + bank_vr + tin + loc + web_ver + owner_ver; // overall 400

  const vouchmark_details = {
    vouch_mark: vouch_mark,
    activeBank: bank_vr > 0 ? true : false,
    social_verified: social_verified,
  };
  return vouchmark_details;
};
const companyDetailSearch = async (
  company_id,
  userId,
  companyView,
  addToPay,
  fieldsToSelect
) => {
  try {
    // Update the view_count only if the company exists and it's not the owner's view
    const existingCompany = await Company.findOne(
      { id: company_id },
      fieldsToSelect
    );

    if (existingCompany && existingCompany?.companyDetails == true) {
      if (addToPay) {
        await PaidCompanyView.updateOne(
          { companyId: existingCompany.id },
          {
            $set: {
              companyId: existingCompany.id,
              userId: userId,
              viewDate: new Date(),
            },
          },
          { upsert: true, runValidators: true }
        );
      }
      let updates = {};
      if (companyView == true) {
        // get vouchmark here
        const company_details = {
          rcNumber: existingCompany.rcNumber,
          cacert_verified: existingCompany.cacert_verified,
          cacreport_verified: existingCompany.cacreport_verified,
          firstaxClearance_vr: existingCompany.firstaxClearance_vr,
          bill_verfied: existingCompany.bill_verfied,
          website_verified: existingCompany.website_verified,
          bank_account_id: existingCompany.owner_bank_id,
          shareHolderVerified: existingCompany.shareHolderVerified,
          facebook: existingCompany.facebook,
          instagram: existingCompany.instagram,
          twitter: existingCompany.twitter,
          website: existingCompany.website,
          tiktok: existingCompany.tiktok,
          linkedin: existingCompany.linkedin,
        };

        const vouchmark_details = await getVouchMark(company_details, userId);

        updates = {
          vouchmark_tools: vouchmark_details,
        };
        if (existingCompany?.ownerId !== userId)
          updates.$inc = { view_count: 1 };

        const new_existingCompany = await Company.findOneAndUpdate(
          { id: company_id },
          updates,
          { new: true, fields: fieldsToSelect }
        );

        return {
          message: "Company detail found in database.",
          company: new_existingCompany,
        };
      }

      return {
        message: "Company detail found in database.",
        company: existingCompany,
      };
    }
    console.log("BIG YES");
    const option2 = {
      method: "GET",
      url: `https://postapp.cac.gov.ng/postapp/api/front-office/status-report/find/company/${company_id}`,
      headers: {
        Accept: "*/*",
        referer: "https://post.cac.gov.ng/",
      },
    };

    const response2 = await axios.request(option2);

    if (!response2.data || !response2.data.data) {
      throw new Error("Company not found");
    }

    let vouchmark_details;
    if (companyView == true) {
      let company_details = {
        rcNumber: response2.data.data.rcNumber || null,
        cacert_verified: null,
        cacreport_verified: null,
        firstaxClearance_vr: null,
        bill_verfied: null,
        website_verified: null,
        bank_account_id: null,
        shareHolderVerified: null,
        facebook: null,
        instagram: null,
        twitter: null,
        website: null,
        tiktok: null,
        linkedin: null,
      };

      vouchmark_details = await getVouchMark(company_details, userId);
    }

    const filter = { id: response2.data.data.id }; // Assuming 'id' is the unique identifier
    const update = {
      $set: {
        companyName: response2.data.data.approvedName || null,
        phone: response2.data.data.phone || null,
        businessCommencementDate:
          response2.data.data.businessCommencementDate || null,
        registrationApproved: response2.data.data.registrationApproved || null,
        rcNumber: response2.data.data.rcNumber || null,
        email: response2.data.data.email || null,
        address: response2.data.data.address || null,
        city: response2.data.data.city || null,
        postcode: response2.data.data.postcode || null,
        lga: response2.data.data.lga || null,
        state: response2.data.data.state || null,
        registrationDate: response2.data.data.registration_date || null,
        natureOfBUsiness: response2.data.data.natureOfBUsiness || null,
        registrarInfo: response2.data.data.regPortalUserFk
          ? {
              surname: response2.data.data.regPortalUserFk.surname || null,
              firstname: response2.data.data.regPortalUserFk.firstname || null,
              email: response2.data.data.regPortalUserFk.email || null,
              address: response2.data.data.regPortalUserFk.address || null,
              city: response2.data.data.regPortalUserFk.city || null,
              state: response2.data.data.regPortalUserFk.state || null,
              contact_address:
                response2.data.data.regPortalUserFk.contact_address || null,
              phone_NUMBER:
                response2.data.data.regPortalUserFk.phone_NUMBER || null,

              date_of_birth:
                response2.data.data.regPortalUserFk.date_of_birth || null,
              nationality:
                response2.data.data.regPortalUserFk.nationality || null,
            }
          : null,
        natureOfBUsiness: response2.data.data.natureOfBusinessFk
          ? response2.data.data.natureOfBusinessFk.name
          : null,
        bussiness_category: response2.data.data.natureOfBusinessFk
          ? response2.data.data.natureOfBusinessFk
              .nature_of_business_category_fk?.category
            ? response2.data.data.natureOfBusinessFk
                .nature_of_business_category_fk?.category
            : null
          : null,
        shareCapital: response2.data.data.shareCapital || null,
        shareCapitalInWords: response2.data.data.shareCapitalInWords || null,
        dividedInto: response2.data.data.dividedInto || null,
        firsTin: response2.data.data.firsTin || null,
        active: response2.data.data.active || null,
        head_office_address: response2.data.data.head_office_address || null,
        company_classification: response2.data.data.company_type_fk
          ? response2.data.data.company_type_fk.classification_fk.name
          : null,
        companyDetails: true,
        vouchmark_tools: vouchmark_details || null,
        firstin_vr: response2.data.data.firsTin ? true : false,
      },
      $inc: {
        view_count: 1,
      },
    };

    const savedCompanyDetails = await Company.findOneAndUpdate(filter, update, {
      upsert: true,
      runValidators: true,
      new: true,
      fields: fieldsToSelect,
    });
    // upsert add to paid comnay for the user
    if (addToPay) {
      await PaidCompanyView.updateOne(
        { companyId: savedCompanyDetails.id },
        {
          $set: {
            companyId: savedCompanyDetails.id,
            userId: userId,
            viewDate: new Date(),
          },
        },
        { upsert: true, runValidators: true }
      );
    }

    return { message: "success", company: savedCompanyDetails };
  } catch (error) {
    console.error("Error fetching company details:", error);
    throw error;
  }
};

// get company_details
app.post(
  "/vouch/api/v1/company/getEmail",
  authMiddleware,
  // verifyEmailMiddleware,
  async (req, res) => {
    const { company_id } = req.body;

    const { userId } = req;

    if (!company_id) {
      return res.status(400).json({ error: "Company ID is required" });
    }

    try {
      const fieldsToSelect = {
        companyName: 1,
        ownerId: 1,
        "registrarInfo.email": 1,
        "registrarInfo.phone_NUMBER": 1,
        companyDetails: 1,
      };
      const result = await companyDetailSearch(
        company_id,
        userId,
        false,
        false,
        fieldsToSelect
      );
      result.company.registrarInfo.email = maskEmail(
        result.company.registrarInfo.email
      );
      result.company.registrarInfo.phone_NUMBER = maskPhoneNumber(
        result.company.registrarInfo.phone_NUMBER
      );

      if (result.company.ownerId) {
        return res.status(400).json({
          message:
            "This company has already been claimed by another user. Please contact support if you believe this is an error.",
        });
      }
      res.status(200).json(result);
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// protected by payment block route
app.post(
  "/vouch/api/v1/company/company_details",
  authMiddleware,
  paymentBlockRoute,
  async (req, res) => {
    const { company_id } = req.body;

    const { userId, lastOne, finalOne } = req;
    console.log("LAST ONE, ", lastOne);

    if (!company_id) {
      return res.status(400).json({ error: "Company ID is required" });
    }

    try {
      const result = await companyDetailSearch(
        company_id,
        userId,
        true,
        true,
        {}
      );
      console.log(result);
      const response = {
        ...result,
        lastOne,
        finalOne,
      };
      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// vouch mark/score
app.post(
  "/vouch/api/v1/company/vouch_mark",
  authMiddleware,
  verifyEmailMiddleware,
  async (req, res) => {
    try {
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "error occured" });
    }
  }
);

// Payment API

app.post(
  "/vouch/api/v1/payment/get-price",
  authMiddleware,
  // verifyEmailMiddleware,
  async (req, res) => {
    try {
      const { userId } = req;
      const { plan } = req.body;

      const planAmounts = {
        basic: 2000000,
        business: 6000000,
      };

      if (plan !== "basic" && plan !== "business") {
        return res.status(400).json({ error: "Invalid plan" });
      }

      const currentDate = new Date();

      // Find the user's active plan
      const activePlan = await ActivePlan.findOne({
        userId,
        start_date: { $lte: currentDate },
        end_date: { $gte: currentDate },
      });

      let responsePayload = {};
      let newEndDate;

      if (!activePlan) {
        if (plan === "basic") {
          new_date = new Date(currentDate);
          newEndDate = new_date.setDate(new_date.getDate() + 30);
        } else if (plan === "business") {
          new_date = new Date(currentDate);
          newEndDate = new_date.setDate(new_date.getDate() + 365);
        }

        responsePayload = {
          price: planAmounts[plan],
          newStartDate: currentDate,
          newEndDate: newEndDate,
          plan,
          message: `Your ${
            plan.charAt(0).toUpperCase() + plan.slice(1)
          } Plan has been activated successfully`,
        };
      } else {
        const { start_date, end_date } = activePlan;
        const daysUsed = Math.ceil(
          (currentDate - start_date) / (1000 * 60 * 60 * 24)
        ); // Calculate the number of days used
        console.log(daysUsed);

        // Calculate the total number of days in the plan
        const totalDays = Math.ceil(
          (end_date - start_date) / (1000 * 60 * 60 * 24)
        );
        console.log("Total days:", totalDays);

        // Calculate the number of days not used
        const daysNotUsed = totalDays - daysUsed;
        console.log("Days not used:", daysNotUsed);

        if (activePlan.plan === "basic" && plan === "basic") {
          new_date = new Date(end_date);
          newEndDate = new_date.setDate(new_date.getDate() + 30); // Extend by 30 days
          date_new = new Date(end_date);
          responsePayload = {
            price: planAmounts.basic,
            exisitingStartDate: start_date,
            newStartDate: date_new,
            newEndDate,
            plan,
            message: "Monthly plan extended successfully.",
          };
        } else if (activePlan.plan === "basic" && plan === "business") {
          const dailyRate = planAmounts.basic / 30;
          const amountNotUsed = dailyRate * daysNotUsed;

          const priceToPay = planAmounts.business - amountNotUsed;
          new_date = new Date(currentDate);
          newEndDate = new_date.setDate(new_date.getDate() + 365);
          if (priceToPay <= 0) {
            return res.status(400).json({
              error:
                "You have an active plan. You cannot upgrade at the moment",
            });
          }
          console.log(formatDate(newEndDate));
          responsePayload = {
            price: Math.ceil(priceToPay),
            newStartDate: currentDate,
            newEndDate,
            plan,
            message: "Successfully upgraded to business plan.",
          };
        } else if (activePlan.plan === "business" && plan === "business") {
          new_date = new Date(end_date);
          newEndDate = new_date.setDate(new_date.getDate() + 365);
          date_new = new Date(end_date);
          responsePayload = {
            price: planAmounts.business,
            exisitingStartDate: start_date,
            newStartDate: date_new,
            newEndDate,
            plan,
            message: "Bussiness plan extended successfully.",
          };
        } else {
          return res
            .status(400)
            .json({ error: "Invalid upgrade/downgrade request." });
        }
      }
      console.log(responsePayload);

      const token = jwt.sign(responsePayload, process.env.JWT_SECRET, {
        expiresIn: "15m",
      });
      return res.status(200).json({ ...responsePayload, token });
    } catch (error) {
      console.error("Error in get-price route:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);
// nearest future , can send those error to the frontend pricing
app.post(
  "/vouch/api/v1/payment/collect_payment/webhook",
  async function (req, res) {
    try {
      const { db_key } = req.query;
      if (!db_key) {
        return res.status(401).json({
          status: 401,
          success: false,
        });
      }
      if (db_key != DB_KEY) {
        return res.status(401).json({
          status: 401,
          success: false,
          error: "check",
        });
      }

      let id_ = req.body.data.reference;

      const event = req.body;
      console.log(event);

      switch (event.event) {
        case "charge.create":
          // Handle successful payment event
          break;

        case "charge.success":
          const dataToSend = {
            email: event.data.customer.email,
            plan: event.data.metadata.custom_fields[1].value,
            token: event.data.metadata.custom_fields[0].value,
            amount: event.data.amount,
          };

          const { email, plan, token, amount } = dataToSend;

          const session = await mongoose.startSession();
          session.startTransaction();

          const user = await User.findOne({ email });
          if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ error: "User not found" });
          }
          const userId = user.userId;
          const decoded = jwt.verify(token, process.env.JWT_SECRET);

          if (plan !== decoded.plan || Number(amount) !== decoded.price) {
            return res.status(400).json({ error: "Invalid plan or amount" });
          }

          const newStartDate = decoded.newStartDate;
          const newEndDate = decoded.newEndDate;
          const existingDate = decoded?.exisitingStartDate;
          const custom_message = decoded.message;

          const newPayment = new Payment({
            userId: userId,
            referenceNumber: id_,
            amount,
            plan,
            start_date: newStartDate,
            end_date: newEndDate,
            email,
          });
          await newPayment.save({ session });

          const updatedActivePlan = await ActivePlan.findOneAndUpdate(
            { userId: userId },
            {
              plan,
              start_date: existingDate || newStartDate,
              end_date: newEndDate,
              free_trial: false,
            },
            { upsert: true, new: true, session }
          );

          await session.commitTransaction();
          session.endSession();

          res.status(200).json({
            message:
              custom_message ||
              "Payment collected successfully and plan updated",
          });

          break;

        default:
          console.log("Unhandled event:", event);
      }
    } catch (error) {
      console.log(error);
      await session.abortTransaction();
      session.endSession();
      if (error.name === "JsonWebTokenError") {
        return res.status(400).json({ error: "Payment Processing timeout" });
      }
      res.status(500).json({ error: error.message });
    }
  }
);

app.get(
  "/vouch/api/v1/payment/free-trial",
  authMiddleware,
  // verifyEmailMiddleware,
  async (req, res) => {
    const { userId } = req;
    const session = await mongoose.startSession();

    try {
      session.startTransaction();
      const user_ = await User.findOne({ userId });
      const activeplan = await ActivePlan.findOne({ userId });
      const payment = await Payment.findOne({ userId });

      if (user_.free_trial <= 0 && !activeplan && !payment) {
        const currentDate = new Date();

        new_date = new Date(currentDate);
        newEndDate = new_date.setDate(new_date.getDate() + 30);

        const updatedActivePlan = await ActivePlan.findOneAndUpdate(
          { userId: userId },
          {
            plan: "basic",
            start_date: currentDate,
            end_date: newEndDate,
            free_trial: true,
          },
          { upsert: true, new: true, session }
        );

        const user = await User.findOneAndUpdate(
          { userId: userId },
          { free_trial: 1 },
          { new: true, runValidators: true, session }
        );

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({ message: "Free trial successful" });
      } else {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ error: "Free trial used or Ineligible" });
      }
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.log(error);
      return res
        .status(500)
        .json({ error: "An error occured, please try again" });
    }
  }
);

//Newsletter API
app.post("/subscribe", async (req, res) => {
  const { email, ip } = req.body;

  try {
    const existingSubscriber = await NewsletterSubscriber.findOne({ email });

    if (existingSubscriber) {
      return res.json({
        message: "Email already subscribed to the newsletter",
      });
    }

    const newSubscriber = new NewsletterSubscriber({
      email,
      ip,
    });

    await newSubscriber.save();
    res.status(201).json({ message: "Subscribed to newsletter successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function generatePasswordResetToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "600000" });
}

function verifyPasswordResetToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

const verifyOwnerOtp = async (otp, userMail) => {
  try {
    const url_ = `${email_url}/api/verifyOnwerOtp`;
    const data = { otp, userMail };

    const response = await axios.post(url_, data);

    if (response.status === 200) {
      return {
        message: response.data?.message || "OTP Verified",
        status: 200,
      };
    }
  } catch (error) {
    console.log(error);
    const errorMessage = error.response?.data?.message || "OTP is invalid";
    const statusCode = error.response?.status || 400;

    return {
      message: errorMessage,
      status: statusCode,
    };
  }
};

// Request Password Reset
app.post("/vouch/api/vauth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    console.log(req.body);
    if (!email) {
      return res.status(400).json({ error: "No email inputted" });
    }
    const user = await User.findOne({ email: email });

    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const token = generatePasswordResetToken(user.userId);
    // const resetLink = `${url}/reset-password/${token}`;
    const resetLink = `${url}/signin?token=${token}`;
    console.log(resetLink);

    const text = `${resetLink}`;

    const { message, status } = await sendNotification(
      text,
      email,
      "sendtokenEmail"
    );
    console.log(message, status);
    if (status == 200) {
      return res.status(200).json({ message: message });
    } else if (status == 400) {
      res.status(400).json({ error: message });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Error occured sending mail" });
  }
});

// Reset Password
app.post("/vouch/api/vauth/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!password || !token) {
    return res.status(400).json({ error: "Password field must not be empty" });
  }
  const decoded = verifyPasswordResetToken(token);
  if (!decoded) {
    return res.status(400).json({ error: "Invalid or expired token" });
  }

  const user = await User.findOne({ userId: decoded.userId });
  if (!user) {
    return res.status(400).json({ error: "User not found" });
  }

  user.password = password;
  await user.save();

  res.status(200).json({ message: "Password has been reset successfully" });
});

// Verify owner of company
app.post("/vouch/api/v1/send-owner-otp", authMiddleware, async (req, res) => {
  const { company_id, email, phone_number } = req.body;
  console.log(req.body);
  const { userId } = req;
  const { company } = await companyDetailSearch(
    company_id,
    userId,
    false,
    false,
    {}
  );

  if (!company) {
    return res.status(400).json({ message: "Company not found" });
  }

  if (company.ownerId) {
    return res.status(400).json({ message: "Company already claimed" });
  }

  if (email == true || email == "true") {
    if (company.email || company?.registrarInfo?.email) {
      if (mailCompany[company.email || company?.registrarInfo?.email]) {
        console.log("yess there is");
        return res
          .status(200)
          .json({ message: "OTP sent successfully", email: true });
      }

      const { message, status } = await sendNotification(
        "",
        company.email || company?.registrarInfo?.email,
        "sendOtpVerifyOwner"
      );
      mailCompany[company.email || company?.registrarInfo?.email] = company_id;
      console.log(
        "sent otp to email: ",
        company.email || company?.registrarInfo?.email
      );

      // Set a timeout to remove the OTP after 9 minutes (540,000 ms)
      setTimeout(() => {
        delete mailCompany[company.email || company?.registrarInfo?.email];
        console.log(
          `OTP for ${
            company.email || company?.registrarInfo?.email
          } removed after 9 minutes.`
        );
      }, 120000); // 120,000 ms = 2 minutes

      return res.status(status).json({ message: message, email: true });
    } else {
      return res
        .status(400)
        .json({ message: "No Email Found. Use Another Option" });
    }
  } else if (phone_number == true) {
    if (company.phone || company.registrarInfo?.phone_NUMBER) {
      let company_phone = company.phone || company.registrarInfo?.phone_NUMBER;
      if (company_phone && company_phone.startsWith("0")) {
        company_phone = "234" + company_phone.slice(1);
      }
      console.log(pinId);
      console.log(phoneCompany);
      console.log(company_phone);
      console.log(process.env.TERMI_SENDER_ID);

      console.log("there is");

      if (pinId[company_phone]) {
        console.log("yess there is");
        return res
          .status(200)
          .json({ message: "OTP sent successfully", phone: true });
      }

      const data = {
        api_key: process.env.TERMI_API_KEY,
        message_type: "NUMERIC",
        to: company_phone,
        from: process.env.TERMI_SENDER_ID,
        channel: "dnd",
        pin_attempts: 10,
        pin_time_to_live: 10,
        pin_length: 4,
        pin_placeholder: "< 1234 >",
        message_text: `
            Your Vouchmark Verification Pin: < 1234 >\n

            This code is valid for 10 minutes and can only be used once.\n

            Thank you for choosing Vouchmark!
          `,
        pin_type: "NUMERIC",
      };

      try {
        const response = await axios.post(
          `${process.env.TERMI_BASE_URL}/api/sms/otp/send`,
          data,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        console.log(response.data);
        if (response.data.smsStatus !== "Message Sent") {
          return res.status(400).json({ message: "Failure sending OTP" });
        }
        phoneCompany[company_phone] = company_id;
        pinId[company_phone] = response.data.pinId;

        setTimeout(() => {
          delete pinId[company_phone];
          console.log(`OTP for ${company_phone} removed after 9 minutes.`);
        }, 540000);

        return res
          .status(200)
          .json({ message: "OTP sent successfully", phone: true });
      } catch (error) {
        console.error("Error sending OTP:", error);
        return res.status(500).json({
          message: "Failed to send OTP",
          error: error.message,
          phone: true,
        });
      }
    } else {
      return res
        .status(400)
        .json({
          message:
            "No Phone Number Found. Update your CAC with your current Email or Phone Number",
          update: true,
        });
    }
  } else {
    res.status(400).json({ message: "Invalid request" });
  }
});

app.post("/vouch/api/v1/verify-owner-otp", authMiddleware, async (req, res) => {
  const { otp, email, phone } = req.body;
  console.log(req.body);
  console.log(pinId);
  console.log(phoneCompany);

  const { userId } = req;
  const user_company = await Company.findOne({ ownerId: userId });
  if (user_company) {
    return res
      .status(400)
      .json({ message: "Bad Request: You already have claimed company" });
  }
  try {
    if (email) {
      const { message, status } = await verifyOwnerOtp(otp, email);

      console.log("status", status);
      if (status == 200) {
        const company_id = mailCompany[email];
        const company = await Company.findOneAndUpdate(
          { id: company_id },
          { ownerId: userId },
          { new: true, runValidators: true }
        );
        console.log(company);
        console.log(company.ownerId);

        if (!company) {
          company.ownerId = null;
          await company.save();
          delete mailCompany[email];
          return res
            .status(400)
            .json({ message: "Bad Request: Could not be completed" });
        }
        delete mailCompany[email];
      }

      return res.status(status).json({ message: message });
    } else if (phone) {
      console.log("yhhhhap");

      // return res.status(200).json({ message: "OTP Succsfully " });

      // verify otp
      const data = {
        api_key: process.env.TERMI_API_KEY,
        pin_id: pinId[phone],
        pin: otp,
      };

      const response = await axios.post(
        `${process.env.TERMI_BASE_URL}/api/sms/otp/verify`,
        data,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      console.log(response.data);

      if (response.data.verified !== "True") {
        const company_id = phoneCompany[phone];
        const company = await Company.findOneAndUpdate(
          { id: company_id },
          { ownerId: userId },
          { new: true, runValidators: true }
        );
        console.log(company);
        console.log(company.ownerId);

        if (!company) {
          company.ownerId = null;
          await company.save();
          delete phoneCompany[phone];
          delete pinId[phone];
          return res
            .status(400)
            .json({ message: "Bad Request: Could not be completed" });
        }
        delete phoneCompany[phone];
        delete pinId[phone];

        return res.status(200).json({ message: "Succesfuuly verified OTP" });
      } else {
        return res.status(400).json({
          message: "An error occured with verification. Please try again",
        });
      }
    } else {
      return res.status(400).json({ message: "Invalid Request" });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "Error Occured. Please try again" });
  }
});

//  edit user deails
app.post(
  "/vouch/api/v1/edit-user",
  authMiddleware,
  // verifyEmailMiddleware,
  async (req, res) => {
    try {
      const {
        name,
        company,
        phoneNumber,
        address,
        state,
        zipCode,
        country,
        timezone,
      } = req.body;
      const { userId } = req;
      const user = await User.findOne({ userId });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // if (user.email !== email) {
      //   user.verifiedEmail = false;
      // }
      user.name = name || user.name;
      user.company_name = company || user.company_name;
      user.phone_no = phoneNumber || user.phone_no;
      user.address = address || user.address;
      user.state = state || user.state;
      user.zip_code = zipCode || user.zip_code;
      user.country = country || user.country;
      user.timezone = timezone || user.timezone;
      await user.save();

      return res.status(200).json({ message: "User details updated successfully" });
    } catch (error) {
      console.error("Error updating user: ", error);
      return res.status(500).json({ message: "Error Occured: Failed to save user details" });
    }
  }
);

app.post("/change-password", authMiddleware, async (req, res) => {
  try {
    const { password, oldPassword, confirm_password } = req.body;
    const { userId } = req;
    console.log(req.body);

    if (!password || !oldPassword || !confirm_password) {
      return res.status(400).json({ message: "Password must not be empty" });
    }
    const user = await User.findOne({ userId });
    if (!user.password) {
      return res
        .status(400)
        .json({ message: "Cannot change password. Google auth detected" });
    }
    const isPasswordValid = await bcrypt.compare(oldPassword, user?.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid Old password" });
    }

    if (password !== confirm_password) {
      return res.status(400).json({ message: "New Passwords must match" });
    }

    const user_ = await User.findOneAndUpdate(
      { userId: userId },
      { password: password },
      { new: true, runValidators: true }
    );
    if (!user_) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "successful" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "An error occured" });
  }
});

const formatUrl = (url) => {
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  return url;
};

const resolveDomain = async (hostname) => {
  try {
    const address = await dns.lookup(hostname);
    return true;
  } catch (err) {
    console.error(`DNS lookup failed: ${err.message}`);
    return false;
  }
};

const checkWebsiteStatus = async (websiteUrl) => {
  if (!websiteUrl) {
    return "Website is not verified";
  }
  try {
    const formattedUrl = formatUrl(websiteUrl);
    const parsedUrl = new URL(formattedUrl);
    const hostname = parsedUrl.hostname;
    const isSecure = parsedUrl.protocol === "https:";

    const domainResolved = await resolveDomain(hostname);
    if (!domainResolved) {
      return "Website is not verified";
    }

    const response = await axios.get(websiteUrl, { timeout: 5000 });
    const isLive = response.status >= 200 && response.status < 400;

    if (isSecure && isLive) {
      return "Website is verified";
    } else {
      return "Website is not verified";
    }
  } catch (error) {
    if (error.status == 403) {
      return "Website is verified";
    }
    if (error.code === "ECONNABORTED") {
      console.error("Request timed out");
    }
    console.error("Error checking website:", error.message);
    return "Website is not verified";
  }
};

app.post(
  "/vouch/api/v1/edit-company/:company_id",
  authMiddleware,
  async (req, res) => {
    const { userId } = req;
    const { company_id } = req.params;
    const user_company = await Company.findOne({
      ownerId: userId,
      id: company_id,
    });
    if (!user_company) {
      return res.status(404).json({ message: "Company not found" });
    }
    const updates = req.body;
    let shareHolderVerified = false;
    if (updates.shareHolderDetails) {
      if (
        !updates.shareHolderDetails[0].name ||
        !updates.shareHolderDetails[0].address ||
        !updates.shareHolderDetails[0].dateOfBirth ||
        !updates.shareHolderDetails[0].nationality ||
        !updates.shareHolderDetails[0].idType ||
        !updates.shareHolderDetails[0].percentageOfOwner ||
        !updates.shareHolderDetails[0].noOfShares ||
        !updates.shareHolderDetails[0].identificationNumber ||
        !updates.shareHolderDetails[0].phoneNumber
      ) {
        return res
          .status(400)
          .json({ message: "Provide all the neccessary details" });
      }

      shareHolderVerified = true;
      updates.shareHolderVerified = shareHolderVerified;
    }

    let website_verified = false;

    if (updates.website) {
      const websiteVerified = await checkWebsiteStatus(updates.website);
      if (websiteVerified === "Website is verified") {
        website_verified = true;
        updates.website_verified = website_verified;
      }
    }

    try {
      const company = await Company.findOneAndUpdate(
        { id: company_id, ownerId: userId },
        { $set: updates },
        { new: true, runValidators: true }
      );

      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }

      if (updates.shareHolder == true) {
        return res.status(200).json({ message: "You have been Verified" });
      }
      if (updates.redirect) {
        return res.status(200).json({ message: "Redirecting to company details", redirect: updates.redirect });
      }
      return res.status(200).json({ message: "Company details updated successfully", redirect: `/dashboard/company-details` });
    } catch (error) {
      console.error("Error updating company details:", error);
      return res.status(500).json({ message: "Error updating company details" });
    }
  }
);

// download compnay detials
app.get(
  "/vouch/api/v1/download/:company_id",
  authMiddleware,
  paymentBlockRoute,
  async (req, res) => {
    const { company_id } = req.params;
    const { userId } = req;
    await generateCompanyPDF(company_id, userId, res);
  }
);

app.post(
  "/vouch/api/v1/connect-account/:company_id",
  authMiddleware,
  async (req, res) => {
    const { code } = req.body;
    const { company_id } = req.params;
    const { userId } = req;

    try {
      const company = await Company.findOne({
        ownerId: userId,
        id: company_id,
      });
      if (!company) {
        return res.status(404).json({ message: "Company not found" });
      }

      const options = {
        method: "POST",
        url: "https://api.withmono.com/v2/accounts/auth",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          "mono-sec-key": MONO_SECRET_KEY,
        },
        data: { code },
      };

      const response = await axios(options);

      if (response.data.status === "successful") {
        const account_id = response.data.data.id;

        const accountOptions = {
          method: "GET",
          url: `https://api.withmono.com/v2/accounts/${account_id}`,
          headers: {
            "Content-Type": "application/json",
            accept: "application/json",
            "mono-sec-key": MONO_SECRET_KEY,
          },
        };

        const accountResponse = await axios(accountOptions);
        const bankAccountName = accountResponse.data?.data?.account?.name;
        const companyName = company.companyName;

        const calculateSimilarity = (str1, str2) => {
          const cleanStr1 = str1.toLowerCase().replace(/[^a-z0-9\s]/g, "");
          const cleanStr2 = str2.toLowerCase().replace(/[^a-z0-9\s]/g, "");

          const words1 = cleanStr1.split(/\s+/);
          const words2 = cleanStr2.split(/\s+/);

          const matchingWords = words1.filter(
            (word) => words2.includes(word) && word.length > 2
          );

          const similarityScore =
            (matchingWords.length * 2) / (words1.length + words2.length);
          return similarityScore;
        };

        const similarityScore = calculateSimilarity(
          bankAccountName,
          companyName
        );
        const SIMILARITY_THRESHOLD = 0.3;

        if (similarityScore < SIMILARITY_THRESHOLD) {
          return res.status(400).json({
            message: "Bank account name does not match company name",
            details: {
              bankName: bankAccountName,
              companyName: companyName,
              similarityScore: similarityScore,
            },
          });
        }

        const updatedCompany = await Company.findOneAndUpdate(
          { ownerId: userId, id: company_id },
          {
            owner_bank_id: account_id,
            bank_account_name: bankAccountName,
            bank_account_number:
              accountResponse.data?.data?.account?.account_number,
            bank_name: accountResponse.data?.data?.account?.institution?.name,
          },
          { new: true, runValidators: true }
        );

        if (!updatedCompany) {
          return res
            .status(404)
            .json({ message: "Failed to update company details" });
        }

        return res.status(200).json({
          message: `Successfully Connected Account to company ${company_id}`,
          details: {
            bankName: bankAccountName,
            companyName: companyName,
            similarityScore: similarityScore,
          },
        });
      } else {
        return res.status(400).json({
          message: "Connection Unsuccessful, try again later",
        });
      }
    } catch (error) {
      console.error(
        "Error:",
        error.response ? error.response.data : error.message
      );

      return res.status(500).json({
        error: `Error occurred connecting to your account.`,
        details: error.message,
      });
    }
  }
);

app.post(
  "/vouch/api/v1/user/delete",
  authMiddleware,
  // verifyEmailMiddleware,
  async (req, res) => {
    try {
      const { userId } = req;

      // Find and delete the user
      const user = await User.findOneAndDelete({ userId });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Cascade delete related documents
      await Company.updateMany({ ownerId: userId }, { ownerId: "" });

      return res.status(200).json({ message: "User deleted successfully", redirect: "/signin" });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ message: "Error deleting user", redirect: "/dashboard/account?error=Error deleting user" });
    }
  }
);

// --------------- AI VERIFICATION --------------------//
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
const uploadFile = async (mediaPath, filename, mediaType) => {
  return await fileManager.uploadFile(mediaPath, {
    mimeType: mediaType,
    displayName: filename,
  });
};

const sampleData = {
  company_name: "Tekcify Technology",
  rc_number: "55255552",
  address: "NO 21 ALHAJI YAYA STREET, ILASA BUS STOP, ILASAMAJA, LAGOS STATE",
};

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

const schema = {
  description: "Verification of document",
  type: SchemaType.OBJECT,
  properties: {
    verified: {
      type: SchemaType.BOOLEAN,
      description: "Verification of document",
      nullable: false,
    },
    reason: {
      type: SchemaType.STRING,
      description: "Reason for verification successful or unsuccessful",
      nullable: false,
    },
  },
};

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  safetySettings,
  generationConfig: {
    responseMimeType: "application/json",
    responseSchema: schema,
  },
});

function deleteFile(filePath) {
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error(`Error deleting file: ${err.message}`);
    } else {
      console.log(`File deleted successfully: ${filePath}`);
    }
  });
}

function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType,
    },
  };
}

const uploadDocumentToCloudinary = async (file, companyId, documentType) => {
  try {
    // Create a unique public_id for the document
    const publicId = `company_docs/${companyId}/${documentType}_${Date.now()}`;

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(file.path, {
      folder: "company_documents",
      public_id: publicId,
      overwrite: true,
    });

    // Remove the temporary file
    fs.unlinkSync(file.path);

    // Update company document in database
    const updateField = {};
    const uploadDateField = {};

    switch (documentType) {
      case "utility_bill":
        updateField.utilityBillUrl = result.secure_url;
        uploadDateField.utilityBillUploadDate = new Date();
        break;
      case "tin_document":
        updateField.tinDocumentUrl = result.secure_url;
        uploadDateField.tinDocumentUploadDate = new Date();
        break;
      case "cac_certificate":
        updateField.cacCertificateUrl = result.secure_url;
        uploadDateField.cacCertificateUploadDate = new Date();
        break;
      case "cac_report":
        updateField.cacReportUrl = result.secure_url;
        uploadDateField.cacReportUploadDate = new Date();
        break;
    }

    // Update the company record with the new document URL and upload date
    await Company.findOneAndUpdate(
      { id: companyId },
      {
        $set: {
          ...updateField,
          ...uploadDateField,
        },
      }
    );

    return result.secure_url;
  } catch (error) {
    console.error("Error uploading document:", error);
    throw error;
  }
};

function calculateAddressSimilarity(address1, address2) {
  if (!address1 || !address2) return 0;

  // Normalize addresses
  const normalizeAddress = (addr) => {
    return (
      addr
        .toLowerCase()
        // Remove special characters and extra spaces
        .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ")
        .replace(/\s+/g, " ")
        // Common abbreviations
        .replace(/street/g, "st")
        .replace(/avenue/g, "ave")
        .replace(/road/g, "rd")
        .replace(/close/g, "cls")
        .replace(/boulevard/g, "blvd")
        .replace(/number/g, "no")
        .replace(/alhaji/g, "alh")
        .replace(/account/g, "a/c")
        .replace(/old/g, "")
        .trim()
    );
  };

  const addr1 = normalizeAddress(address1);
  const addr2 = normalizeAddress(address2);

  // Split addresses into words
  const words1 = addr1.split(" ").filter((word) => word.length > 1);
  const words2 = addr2.split(" ").filter((word) => word.length > 1);

  // Count matching words
  let matches = 0;
  let totalWords = Math.max(words1.length, words2.length);

  words1.forEach((word1) => {
    if (
      words2.some((word2) => {
        // Check for exact match or high similarity
        return (
          word1 === word2 ||
          (word1.length > 3 &&
            word2.length > 3 &&
            (word1.includes(word2) || word2.includes(word1)))
        );
      })
    ) {
      matches++;
    }
  });

  // Calculate base similarity score
  let score = matches / totalWords;

  // Additional checks for key elements
  const hasMatchingStreetName = words1.some((w1) =>
    words2.some(
      (w2) =>
        w1.length > 3 && w2.length > 3 && (w1.includes(w2) || w2.includes(w1))
    )
  );

  const hasMatchingArea =
    (addr1.includes("ilasamaja") && addr2.includes("ilasa")) ||
    (addr1.includes("ilasa") && addr2.includes("ilasamaja")) ||
    (addr1.includes("ilupeju") && addr2.includes("ilupeju")) ||
    (addr1.includes("ikeja") && addr2.includes("ikeja")) ||
    (addr1.includes("surulere") && addr2.includes("surulere"));

  // Adjust score based on key matches
  if (hasMatchingStreetName) score += 0.2;
  if (hasMatchingArea) score += 0.2;

  // Cap the score at 1
  return Math.min(score, 1);
}

app.post(
  "/verifyBill",
  authMiddleware,
  upload.single("bill"),
  async (req, res) => {
    try {
      const {
        country,
        companyId,
        meterNumber,
        provider,
        vouchAddress,
        vouchCity,
        vouchLga,
        vouchState,
        vouchPostcode,
      } = req.body;
      const { userId } = req;
      const file = req.file;

      const company = await Company.findOne({ id: companyId });

      // Validate required parameters
      if (!file || !country || !companyId) {
        return res.status(400).json({ error: "Missing file or company data" });
      }

      // First try image verification
      const formData = new FormData();
      formData.append("bill", fs.readFileSync(file.path), {
        filename: file.originalname || "utility_bill.jpg",
        contentType: file.mimetype,
      });

      try {
        const imageVerificationResponse = await axios.post(
          `${address_main_url}/vapi/verify-utility-bill/image`,
          formData,
          {
            headers: {
              ...formData.getHeaders(),
              "Content-Type": "multipart/form-data",
            },
          }
        );

        // If image verification succeeds, proceed with address comparison
        if (imageVerificationResponse.data.success) {
          const billAddress =
            imageVerificationResponse.data.verificationResult.address;
          const compareAddress =
            vouchAddress || company.vouchAddress || company.address;
          const similarityScore = calculateAddressSimilarity(
            billAddress,
            compareAddress
          );

          if (similarityScore >= 0.25) {
            // Proceed with verification success flow
            return await handleVerificationSuccess(
              file,
              companyId,
              country,
              vouchAddress,
              vouchCity,
              vouchLga,
              vouchState,
              vouchPostcode,
              imageVerificationResponse.data,
              similarityScore,
              res
            );
          }
        }

        // Store the image verification error
        const imageVerificationError = imageVerificationResponse.data.error;

        // If meter number verification is possible and the error was about meter number
        if (
          (meterNumber &&
            provider &&
            imageVerificationError.toLowerCase().includes("meter")) ||
          imageVerificationError.toLowerCase().includes("provider")
        ) {

          // Try meter number verification
          const meterVerificationResponse = await axios.post(
            `${address_main_url}/vapi/verify-utility-bill/manual`,
            {
              meterNumber,
              provider,
            }
          );

          if (meterVerificationResponse.data.success) {
            const billAddress = meterVerificationResponse.data.address;
            const compareAddress =
              vouchAddress || company.vouchAddress || company.address;
            const similarityScore = calculateAddressSimilarity(
              billAddress,
              compareAddress
            );

            if (similarityScore >= 0.25) {
              // Proceed with verification success flow
              return await handleVerificationSuccess(
                file,
                companyId,
                country,
                meterVerificationResponse.data,
                similarityScore,
                res
              );
            }
          }
        }

        // If we reach here, neither verification method succeeded
        await deleteFile(file.path);
        return res.status(400).json({
          status: "unverified",
          message: imageVerificationError,
          suggestions: [
            "Ensure the bill is recent (less than 3 months old)",
            "Make sure the meter number is clearly visible",
            "Verify that the provider name is visible",
            "Check if the address matches your registered address",
          ],
        });
      } catch (verificationError) {
        console.error("Verification error:", verificationError);
        throw verificationError;
      }
    } catch (error) {
      console.error("Initial verification error:", error);

      // Clean up file if it exists
      if (req.file) {
        try {
          // If meter number and provider are provided, try meter verification as fallback
          const { meterNumber, provider, companyId, country } = req.body;

          if (meterNumber && provider) {
            console.log("Attempting meter verification fallback...");

            try {
              const meterVerificationResponse = await axios.post(
                `${address_main_url}/vapi/verify-utility-bill/manual`,
                {
                  meterNumber,
                  provider,
                }
              );

              if (meterVerificationResponse.data.success) {
                const company = await Company.findOne({ id: companyId });
                const billAddress =
                  meterVerificationResponse.data.verificationResult.address;
                const compareAddress =
                  vouchAddress || company.vouchAddress || company.address;
                const similarityScore = calculateAddressSimilarity(
                  billAddress,
                  compareAddress
                );
                console.log(similarityScore);

                if (similarityScore >= 0.25) {
                  return await handleVerificationSuccess(
                    req.file,
                    companyId,
                    country,
                    meterVerificationResponse.data,
                    similarityScore,
                    res
                  );
                }
              }
            } catch (meterError) {
              console.error("Meter verification fallback failed:", meterError);
            }
          }

          await deleteFile(req.file.path);
        } catch (cleanupError) {
          console.error("Error during file cleanup:", cleanupError);
        }
      }

      if (error.response?.data) {
        return res.status(error.response.status || 400).json({
          status: "error",
          message: error.response.data.error || "Verification failed",
          details: error.response.data.message,
          suggestions: [
            "Ensure the bill is recent (less than 3 months old)",
            "Make sure the meter number is clearly visible",
            "Verify that the provider name is visible",
            "Check if the address matches your registered address",
            error.response.data.suggestions
              ? `Additional info: ${error.response.data.suggestions}`
              : "Try providing your meter number and provider for verification",
          ].filter(Boolean),
        });
      }

      if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
        return res.status(503).json({
          status: "error",
          message: "Verification service temporarily unavailable",
          suggestions: [
            "Please try again later",
            "If you provided meter details, we'll try to verify those",
          ],
        });
      }

      return res.status(500).json({
        status: "error",
        message: "Failed to verify utility bill",
        suggestions: [
          "Upload a clear, well-lit image of your utility bill",
          "Ensure the meter number is clearly visible",
          "Make sure the provider name is visible",
          "Verify that the bill date is clearly shown",
          "The bill must be less than 3 months old",
          "If possible, provide your meter number and provider for verification",
        ],
      });
    }
  }
);

async function handleVerificationSuccess(
  file,
  companyId,
  country,
  vouchAddress,
  vouchCity,
  vouchLga,
  vouchState,
  vouchPostcode,
  verificationData,
  similarityScore,
  res
) {
  const documentUrl = await uploadDocumentToCloudinary(
    file,
    companyId,
    "utility_bill"
  );

  await Company.findOneAndUpdate(
    { id: companyId },
    {
      country,
      vouchAddress,
      vouchCity,
      vouchLga,
      vouchState,
      vouchPostcode,
      bill_verfied: true,
      bill_verfied_date: new Date(),
      utilityBillUrl: documentUrl,
      utilityBillUploadDate: new Date(),
    },
    { new: true, runValidators: true }
  );

  await deleteFile(file.path);

  return res.status(200).json({
    status: "verified",
    message: "Utility bill verified successfully",
    billInfo: verificationData.billInfo,
    verificationDetails: {
      ...verificationData.verificationResult,
      addressSimilarity: similarityScore,
    },
  });
}

function handleVerificationError(error, res) {
  if (error.response?.data) {
    return res.status(error.response.status).json({
      status: "error",
      message: error.response.data.error,
      suggestions: error.response.data.suggestions,
    });
  }

  return res.status(500).json({
    status: "error",
    message: "Failed to verify utility bill",
    suggestions: [
      "Upload a clear, well-lit image of your utility bill",
      "Ensure the meter number is clearly visible",
      "Make sure the provider name is visible",
      "Verify that the bill date is clearly shown",
      "The bill must be less than 3 months old",
      "Make sure the image is not blurry or distorted",
    ],
  });
}

app.post(
  "/verifyTin",
  authMiddleware,
  upload.single("tin"),
  async (req, res) => {
    try {
      const { companyId } = req.body;
      const { userId } = req;
      const file = req.file;

      // Validate required parameters
      if (!file || !companyId) {
        return res.status(400).json({ error: "Missing file or companyId" });
      }

      // Load the second file from the file system
      const systemFilePath = path.join(__dirname, "reference_firstin.jpg"); // Example file path
      if (!fs.existsSync(systemFilePath)) {
        return res.status(500).json({ error: "Reference file not found" });
      }

      // Turn images to Part objects
      const filePart1 = fileToGenerativePart(file.path, file.mimetype);
      const filePart2 = fileToGenerativePart(systemFilePath, "image/jpg");

      const imageParts = [filePart1, filePart2];

      const companyData = {
        tin: (await Company.findOne({ id: companyId })).firsTin,
      };

      const prompt = `ADVANCED TAX CLEARANCE CERTIFICATE AUTHENTICATION PROTOCOL

      OBJECTIVE:
      - Verify the authenticity of the uploaded tax clearance certificate
      - Extract the TIN number and verify it matches company details
      - Ensure document matches standard FIRS format using reference document
      - Verify document belongs to: ${JSON.stringify(companyData)}
      
      VERIFICATION CRITERIA:
      1. DOCUMENT TYPE VERIFICATION:
         - Confirm document is an official FIRS Tax Clearance Certificate
         - Verify document structure matches reference template
         - Check for official FIRS watermarks and security features
      
      2. COMPANY INFORMATION VALIDATION:
         - Verify company name matches exactly: "${companyData.company_name}"
         - Confirm RC Number matches: "${companyData.rc_number}"
         - Validate registered address
         - Extract and verify TIN number format
      
      3. DOCUMENT INTEGRITY ANALYSIS:
         - Check for signs of digital manipulation
         - Verify document resolution and quality
         - Analyze for inconsistent fonts or formatting
         - Detect potential forgery indicators
      
      4. TEMPORAL VALIDATION:
         - Verify certificate issue date
         - Check certificate validity period
         - Confirm tax clearance period coverage
      
      REQUIRED OUTPUT FORMAT:
      {
        "verified": boolean,
        "reason": string,
        "extracted_tin": string,
        "issue_date": string,
        "expiry_date": string
      }
      
      VERIFICATION MANDATE:
      - Must extract exact TIN number if document is valid
      - Reject documents with any signs of tampering
      - Ensure strict matching with provided company details
      - Compare against reference document for authenticity
      - Return detailed reason for verification result`;

      const generatedContent = await model.generateContent([
        prompt,
        ...imageParts,
      ]);

      console.log(generatedContent.response.text());

      if (!generatedContent || generatedContent.error) {
        throw new Error("Failed to verify the uploaded document.");
      }

      // Parse the AI response
      const responseText = generatedContent.response.text();
      const verificationResponse = JSON.parse(responseText);

      if (
        !verificationResponse ||
        typeof verificationResponse.verified === "undefined"
      ) {
        throw new Error("Invalid response from AI verification.");
      }

      const resultVerified = verificationResponse.verified;
      const documentUrl = await uploadDocumentToCloudinary(
        file,
        companyId,
        "tin_document"
      );
      // Clean up temporary files
      await deleteFile(file.path);

      if (resultVerified) {
        const company = await Company.findOneAndUpdate(
          { id: companyId },
          {
            firstaxClearance_vr: true,
            ...(resultVerified ? {} : { tinDocumentUrl: null }),
          },
          { new: true, runValidators: true }
        );
        return res.json({ status: "verified" });
      } else {
        return res.json({ status: "unverified" });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

app.post(
  "/verifyCacAndReport",
  authMiddleware,
  upload.fields([
    { name: "cacert", maxCount: 1 },
    { name: "cacReport", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { companyId, isLatest = true } = req.body;
      const cacertFile = req.files.cacert ? req.files.cacert[0] : null;
      const cacReportFile = req.files.cacReport ? req.files.cacReport[0] : null;

      if (!companyId || (!cacertFile && !cacReportFile)) {
        return res
          .status(400)
          .json({ error: "At least one file is required." });
      }

      const data = await Company.findOne({ id: companyId });
      const companyData = {
        company_name: data.companyName,
        rc_number: data.rcNumber,
        address: data.vouchAddress || data.address,
      };

      let cacertVerified = data.cacert_verified || false;
      let cacReportVerified = data.cacreport_verified || false;

      if (cacertFile) {
        const systemFilePath = path.join(__dirname, isLatest ? "reference_cac_doc.pdf" : "reference_cac_doc_prev.pdf");
        if (!fs.existsSync(systemFilePath)) {
          return res.status(500).json({ error: "Reference file not found" });
        }

        const filePart1 = fileToGenerativePart(
          cacertFile.path,
          cacertFile.mimetype
        );
        const filePart2 = fileToGenerativePart(
          systemFilePath,
          "application/pdf"
        );
        const prompt = `ADVANCED CAC DOCUMENT AUTHENTICATION PROTOCOL

OBJECTIVE:
- Verify the authenticity of the uploaded CAC certificate and status report.
- Ensure the document details match the provided company data: ${JSON.stringify(
          companyData
        )}.

VERIFICATION CRITERIA:
1. DOCUMENT AUTHENTICITY:
   - Confirm the document is a genuine CAC certificate or status report.
   - Identify key features and security elements typical of authentic CAC documents.
   - Use the reference document as a guide to understand expected document structure and features.

2. DATA CONSISTENCY:
   - Cross-check the company name, RC number, and address in the document against the provided company data.
   - Ensure all critical fields are present and correctly filled.

3. ANTI-FORGERY ANALYSIS:
   - Detect any signs of digital manipulation or forgery.
   - Analyze the document for inconsistencies in fonts, layout, and other elements that may indicate tampering.

4. STRUCTURAL INTEGRITY:
   - Verify the document's layout and design align with standard CAC document formats.
   - Ensure the document maintains professional presentation and official design elements.

RESPONSE FORMAT:
- If VERIFIED:
  * Confirm document authenticity and data consistency.
  * Provide a summary of key verification points.

- If NOT VERIFIED:
  * Specify reasons for rejection.
  * Highlight any detected inconsistencies or signs of tampering.

MANDATE:
- Apply maximum scrutiny to detect even minimal attempts at forgery or misrepresentation.
- Distinguish between legitimate document variations and sophisticated fraudulent attempts.`;

        const imageParts = [filePart1, filePart2];
        const generatedContent = await model.generateContent([
          prompt,
          ...imageParts,
        ]);

        console.log(generatedContent.response.text());

        if (!generatedContent || generatedContent.error) {
          throw new Error("Failed to verify the uploaded document.");
        }

        // Parse the AI response
        const responseText = generatedContent.response.text();
        const verificationResponse = JSON.parse(responseText);
        if (
          !verificationResponse ||
          typeof verificationResponse.verified === "undefined"
        ) {
          throw new Error("Invalid response from AI verification.");
        }
        cacertVerified = verificationResponse.verified;
        const documentUrl = await uploadDocumentToCloudinary(
          cacertFile,
          companyId,
          "cac_certificate"
        );
        await deleteFile(cacertFile.path);
      }

      if (cacReportFile && isLatest) {
        const systemFilePath = path.join(
          __dirname,
          "reference_cac_status_doc.pdf"
        ); // Example file path
        if (!fs.existsSync(systemFilePath)) {
          return res.status(500).json({ error: "Reference file not found" });
        }

        const filePart1 = fileToGenerativePart(
          systemFilePath,
          "application/pdf"
        );
        const filePart2 = fileToGenerativePart(
          cacReportFile.path,
          cacReportFile.mimetype
        );

        const prompt = `ADVANCED CAC STATUS REPORT DOCUMENT AUTHENTICATION PROTOCOL

        OBJECTIVE:
        - Verify the authenticity of the uploaded CAC status report.
        - Ensure the document details match the provided company data: ${JSON.stringify(
          companyData
        )}. the BN number is also the rcNumber
        - note the reference number which is a 3RDLINK INVESTMENT LTD company status report is the reference file. 
        VERIFICATION CRITERIA:
        1. DOCUMENT AUTHENTICITY:
           - Confirm the document is a genuine CAC status report.
           - Identify key features and security elements typical of authentic CAC status reports.
           - Use the reference document as a guide to understand expected document structure and features.
        
        2. DATA CONSISTENCY:
           - Cross-check the company name, RC number, and address in the document against the provided company data.
           - Ensure all critical fields are present and correctly filled.
        
        3. ANTI-FORGERY ANALYSIS:
           - Detect any signs of digital manipulation or forgery.
           - Analyze the document for inconsistencies in fonts, layout, and other elements that may indicate tampering.
        
        4. STRUCTURAL INTEGRITY:
           - Verify the document's layout and design align with standard CAC status report formats.
           - Ensure the document maintains professional presentation and official design elements.
        
        RESPONSE FORMAT:
        - If VERIFIED:
          * Confirm document authenticity and data consistency.
          * Provide a summary of key verification points.
        
        - If NOT VERIFIED:
          * Specify reasons for rejection.
          * Highlight any detected inconsistencies or signs of tampering.
        
        MANDATE:
        - Apply maximum scrutiny to detect even minimal attempts at forgery or misrepresentation.
        - Distinguish between legitimate document variations and sophisticated fraudulent attempts.`;

        const imageParts = [filePart1, filePart2];
        const generatedContent = await model.generateContent([
          prompt,
          ...imageParts,
        ]);

        console.log(generatedContent.response.text());

        if (!generatedContent || generatedContent.error) {
          throw new Error("Failed to verify the uploaded document.");
        }

        const responseText = generatedContent.response.text();
        const verificationResponse = JSON.parse(responseText);
        if (
          !verificationResponse ||
          typeof verificationResponse.verified === "undefined"
        ) {
          throw new Error("Invalid response from AI verification.");
        }
        cacReportVerified = verificationResponse.verified;

        const documentUrl = await uploadDocumentToCloudinary(
          cacReportFile,
          companyId,
          "cac_report"
        );
        await deleteFile(cacReportFile.path);
      } else if (!isLatest) {
        // If not latest, automatically set CAC report as verified
        cacReportVerified = true;
      }

      let verified = true;
      if (cacertVerified == false || cacReportVerified == false)
        verified = false;

      await Company.findOneAndUpdate(
        { id: companyId },
        {
          cacert_verified: verified,
          cacreport_verified: verified,
          ...(cacertVerified ? {} : { cacCertificateUrl: null }),
          ...(cacReportVerified ? {} : { cacReportUrl: null }),
        },
        { new: true, runValidators: true }
      );

      if (cacertVerified && cacReportVerified) {
        return res.json({
          status: "verified",
          message: "Both CAC certificate and Status Report are verified.",
        });
      } else if (cacertVerified || cacReportVerified) {
        return res.json({
          status: "partially_verified",
          message: cacertVerified
            ? "CAC certificate verified, Status Report unverified."
            : "Status Report verified, CAC certificate unverified.",
        });
      } else {
        return res.json({
          status: "unverified",
          message: "Neither CAC certificate nor Status Report is verified.",
        });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

app.post("/vouch/api/v1/check-email", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Email is available",
    });
  } catch (error) {
    console.error("Error checking email:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = app;
