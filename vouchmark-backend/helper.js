require("dotenv").config();
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const jwtSecret = process.env.JWT_SECRET;
const {
  User,
  Company,
  PaidCompanyView,
  Payment,
  ActivePlan,
} = require("./model");
const path = require("path");
const axios = require("axios");

const email_url = "https://vouchmark.com";

const getTokenFromHeaders = (req) => {
  // Check for Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  
  // Alternatively check for token in a custom header
  const tokenHeader = req.headers['x-auth-token'];
  if (tokenHeader) {
    return tokenHeader;
  }
  
  return null;
};

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from headers instead of cookies
    const token = getTokenFromHeaders(req);

    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.', redirect: `${encodeURIComponent(req.originalUrl)}` });
    }

    const decoded = jwt.verify(token, jwtSecret);

    const user = await User.findOne({ userId: decoded.userId });
    if (!user) {
      return res.status(401).json({ message: 'Invalid token. User not found.', redirect: `${encodeURIComponent(req.originalUrl)}` });
    }
    req.userId = decoded.userId;
    next();
  } catch (error) {
    console.log(error);
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Invalid token.', redirect: `${encodeURIComponent(req.originalUrl)}` });
    }
    return res.status(500).json({ message: 'Server error during authentication.', redirect: `${encodeURIComponent(req.originalUrl)}` });
  }
};

const checkAuthMiddleware = async (req, res, next) => {
  try {
    // Get token from headers instead of cookies
    const token = getTokenFromHeaders(req);
    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, jwtSecret);

    const user = await User.findOne({ userId: decoded.userId });
    if (!user) {
      return next();
    }
    req.userId = decoded.userId;
    return next();
  } catch (error) {
    console.log(error);
    if (error instanceof jwt.JsonWebTokenError) {
      return next();
    }
    return next();
  }
};

const verifyEmailMiddleware = async (req, res) => {
  const { userId } = req;
  const user = await User.findOne({ userId: userId });

  if (!user) {
    return res.redirect("/signin");
  }

  if (user.verifiedEmail == false) {
    return res.redirect("/verify");
  }
};

const forClaimUsers = async (req, res, next) => {
  const { userId } = req;
  const user = await User.findOne({ userId: userId });
  if (user.purpose !== "claim") {
    return res.redirect("404");
  }
  next();
};

async function generateCompanyPDF(companyId, userId, res) {
  try {
    const companies = await PaidCompanyView.aggregate([
      { $match: { userId: userId, companyId: companyId } },
      {
        $lookup: {
          from: Company.collection.name,
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

    if (companies.length === 0) {
      throw new Error("Company not found");
    }

    const company = companies[0];

    const doc = new PDFDocument({ margin: 50 });

    const filePath = path.join(__dirname, `company_${companyId}.pdf`);

    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    doc
      .fontSize(20)
      .text(company.companyDetails.companyName, { align: "center" });
    doc.moveDown();

    doc.fontSize(14).text("Company Information", { underline: true });
    doc.moveDown(0.5);

    addField(doc, "Company Name", company.companyDetails.companyName);
    addField(
      doc,
      "Business Commencement Date",
      company.companyDetails.businessCommencementDate
    );
    addField(
      doc,
      "Registration Approved",
      company.companyDetails.registrationApproved ? "Yes" : "No"
    );
    addField(doc, "RC Number", company.companyDetails.rcNumber);
    addField(doc, "Email", company.companyDetails.email);
    addField(doc, "Address", company.companyDetails.address);
    addField(doc, "City", company.companyDetails.city);
    addField(doc, "State", company.companyDetails.state);
    addField(doc, "Postcode", company.companyDetails.postcode);
    addField(
      doc,
      "Nature of Business",
      company.companyDetails.natureOfBUsiness
    );
    addField(
      doc,
      "Business Category",
      company.companyDetails.bussiness_category
    );
    addField(doc, "Share Capital", company.companyDetails.shareCapital);
    addField(
      doc,
      "Share Capital (In Words)",
      company.companyDetails.shareCapitalInWords
    );
    addField(doc, "FIRS TIN", company.companyDetails.firsTin);

    doc.moveDown();

    doc.fontSize(14).text("Registrar Information", { underline: true });
    doc.moveDown(0.5);

    addField(doc, "Surname", company.companyDetails.registrarInfo.surname);
    addField(doc, "Firstname", company.companyDetails.registrarInfo.firstname);
    addField(doc, "Email", company.companyDetails.registrarInfo.email);
    addField(doc, "Address", company.companyDetails.registrarInfo.address);
    addField(doc, "City", company.companyDetails.registrarInfo.city);
    addField(doc, "State", company.companyDetails.registrarInfo.state);
    addField(
      doc,
      "Contact Address",
      company.companyDetails.registrarInfo.contact_address
    );
    addField(
      doc,
      "Phone Number",
      company.companyDetails.registrarInfo.phone_NUMBER
    );
    addField(
      doc,
      "Date of Birth",
      formatDate(company.companyDetails.registrarInfo.date_of_birth)
    );
    addField(
      doc,
      "Nationality",
      company.companyDetails.registrarInfo.nationality
    );

    doc.end();

    writeStream.on("finish", function () {
      res.download(filePath, (err) => {
        if (err) {
          console.error("Error sending file:", err);
          return res.status(500).json({ message: "Error downloading file" });
        } else {
          fs.unlinkSync(filePath);
        }
      });
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return res.status(500).json({ message: "Error downloading file" });
  }
}

const formatDate = (viewDate) => {
  const now = new Date();
  const date = new Date(viewDate);

  const timeDifference = now - date;
  const oneDay = 24 * 60 * 60 * 1000;

  const daysDifference = Math.floor(timeDifference / oneDay);

  if (daysDifference === 0) {
    return `Today at ${date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } else if (daysDifference === 1) {
    return `Yesterday at ${date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } else {
    return `${date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })} at ${date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
};

function addField(doc, label, value) {
  doc
    .fontSize(12)
    .text(`${label}:`, { continued: true })
    .font("Helvetica-Bold")
    .text(` ${value || "N/A"}`);
  doc.moveDown(0.3);
}

function maskEmail(email) {
  const [localPart, domain] = email.split("@");

  const visiblePart = localPart.slice(0, 3);

  const maskedLocalPart = visiblePart + "*****";

  return `${maskedLocalPart}@${domain}`;
}

function maskPhoneNumber(phoneNumber) {
  return phoneNumber.slice(0, -4).replace(/\d/g, "*") + phoneNumber.slice(-4);
}

function maskAddress(address) {
  const length = address.length;

  if (length <= 10) {
    return `${address} *****`;
  }

  const startPart = address.substring(0, 5);
  const endPart = address.substring(length - 8);
  const maskedPart = "*****";

  return `${startPart}${maskedPart}${endPart}`;
}

const paymentBlockRoute = async (req, res, next) => {
  try {
    console.log(req.originalUrl);
    console.log(encodeURIComponent(req.originalUrl));
    req.lastOne = false;
    req.finalOne = false;

    const { userId } = req;

    const currentDate = new Date();

    const payment = await ActivePlan.findOne({
      userId: userId,
      start_date: { $lte: currentDate },
      end_date: { $gte: currentDate },
    });

    if (!payment) {
      return res.redirect(
        `/pricing?redirect=${encodeURIComponent(req.originalUrl)}`
      );
    }

    if (
      payment.plan == "basic" &&
      req.originalUrl == "/vouch/api/v1/company/company_details"
    ) {
      console.log("yes");
      const currentDate = new Date();

      const startOfDay = new Date(currentDate.setHours(0, 0, 0, 0));

      const paidSearchesToday = await PaidCompanyView.find({
        userId: userId,
        viewDate: { $gte: startOfDay },
      }).distinct("companyId");
      console.log("paidSearchesToday");

      console.log(paidSearchesToday);

      if (payment.free_trial && paidSearchesToday.length == 0) {
        req.lastOne = true;
      }

      if (payment.free_trial && paidSearchesToday.length == 1) {
        req.finalOne = true;
      }

      if (payment.free_trial && paidSearchesToday.length >= 2) {
        return res.json({
          message: "Daily limit of 2 unique company searches reached.",
          redirect: `${encodeURIComponent(req.originalUrl)}`,
        });
      }

      if (paidSearchesToday.length == 3) {
        req.lastOne = true;
      }

      if (paidSearchesToday.length == 4) {
        req.finalOne = true;
      }

      if (paidSearchesToday.length >= 5) {
        return res.json({
          message: "Daily limit of 5 unique company searches reached.",
          redirect: `${encodeURIComponent(req.originalUrl)}`,
        });
      }
    }

    req.payment = payment;

    next();
  } catch (error) {
    console.error("Error in paymentBlockRoute middleware:", error);
    return res.redirect(
      `/pricing?redirect=${encodeURIComponent(req.originalUrl)}`
    );
  }
};

const updateCompanyData = async () => {
  try {
    const companies = await Company.find({});

    for (const company of companies) {
      const company_id = company.id;

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
        console.log(`No data found for company ID: ${company_id}`);
        return;
      }

      const update = {
        companyName: response2.data.data.approvedName || company.companyName,
        businessCommencementDate:
          response2.data.data.businessCommencementDate ||
          company.businessCommencementDate,
        registrationApproved:
          response2.data.data.registrationApproved ||
          company.registrationApproved,
        rcNumber: response2.data.data.rcNumber || company.rcNumber,
        email: response2.data.data.email || company.email,
        address: response2.data.data.address || company.address,
        city: response2.data.data.city || company.city,
        postcode: response2.data.data.postcode || company.postcode,
        lga: response2.data.data.lga || company.lga,
        state: response2.data.data.state || company.state,
        registrationDate:
          response2.data.data.registration_date || company.registrationDate,
        natureOfBUsiness:
          response2.data.data.natureOfBUsiness || company.natureOfBUsiness,
        registrarInfo: response2.data.data.regPortalUserFk
          ? {
              surname:
                response2.data.data.regPortalUserFk.surname ||
                company?.registrarInfo?.surname,
              firstname:
                response2.data.data.regPortalUserFk.firstname ||
                company?.registrarInfo.firstname,
              email:
                response2.data.data.regPortalUserFk.email ||
                company?.registrarInfo.email,
              address:
                response2.data.data.regPortalUserFk.address ||
                company?.registrarInfo.address,
              city:
                response2.data.data.regPortalUserFk.city ||
                company?.registrarInfo.city,
              state:
                response2.data.data.regPortalUserFk.state ||
                company?.registrarInfo.state,
              contact_address:
                response2.data.data.regPortalUserFk.contact_address ||
                company?.registrarInfo.contact_address,
              phone_NUMBER:
                response2.data.data.regPortalUserFk.phone_NUMBER ||
                company?.registrarInfo.phone_NUMBER,

              date_of_birth:
                response2.data.data.regPortalUserFk.date_of_birth ||
                company?.registrarInfo.date_of_birth,
              nationality:
                response2.data.data.regPortalUserFk.nationality ||
                company?.registrarInfo.nationality,
            }
          : company.registrarInfo,
        natureOfBUsiness: response2.data.data.natureOfBusinessFk
          ? response2.data.data.natureOfBusinessFk.name
          : company.natureOfBUsiness,
        bussiness_category: response2.data.data.natureOfBusinessFk
          ? response2.data.data.natureOfBusinessFk
              .nature_of_business_category_fk?.category
            ? response2.data.data.natureOfBusinessFk
                .nature_of_business_category_fk?.category
            : company.bussiness_category
          : company.bussiness_category,
        shareCapital: response2.data.data.shareCapital || company.shareCapital,
        shareCapitalInWords:
          response2.data.data.shareCapitalInWords ||
          company.shareCapitalInWords,
        dividedInto: response2.data.data.dividedInto || company.dividedInto,
        firsTin: response2.data.data.firsTin || company.firsTin,
        active: response2.data.data.active || company.active,
        head_office_address:
          response2.data.data.head_office_address ||
          company.head_office_address,
        company_classification: response2.data.data.company_type_fk
          ? response2.data.data.company_type_fk.classification_fk.name
          : company.company_classification,
        companyDetails: true,
        firstin_vr: response2.data.data.firsTin ? true : company.firstin_vr,
      };

      await Company.updateOne({ id: company_id }, { $set: update });
      console.log(`Updated company with ID: ${company_id}`);
    }
  } catch (error) {
    console.error("Error updating company data:", error);
  }
};

const sendNotification = async (text, email, type) => {
  try {
    const url_ = `${email_url}/api/${type}`;
    const data = {
      from: "noreply",
      to: email,
      text: text,
    };

    console.log("check");
    console.log(url_);

    const response = await axios.post(url_, data);
    console.log("check2");
    console.log(response);

    if (response.status === 200) {
      return { message: "Notification sent successfully", status: 200 };
    } else {
      return {
        message: "Notification sent with warnings",
        status: response.status,
      };
    }
  } catch (error) {
    console.log(error);

    const errorMessage =
      error.response?.data?.message || "Email failed to send, try again";
    const statusCode = error.response?.status || 400;

    return {
      message: errorMessage,
      status: statusCode,
    };
  }
};

const updateBillVerfied = async () => {
  try {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const companies = await Company.find({
      bill_verfied: true,
      bill_verfied_date: { $lte: threeMonthsAgo },
    });

    for (const company of companies) {
      company.bill_verfied = false;
      await company.save();

      const user = await User.findOne({ userId: company.ownerId });

      if (user) {
        const { message, status } = await sendNotification(
          "",
          user.email,
          "updateBillEmail"
        );
        console.log(`${message} with status ${status}`);
      }
    }

    console.log(
      `Address verification status updated for ${companies.length} companies.`
    );
  } catch (error) {
    console.error("Error updating bills and sending emails:", error);
  }
};

module.exports = {
  authMiddleware,
  verifyEmailMiddleware,
  checkAuthMiddleware,
  generateCompanyPDF,
  maskEmail,
  maskAddress,
  forClaimUsers,
  formatDate,
  maskPhoneNumber,
  paymentBlockRoute,
  updateCompanyData,
  updateBillVerfied,
  sendNotification,
  email_url,
  getTokenFromHeaders,
};
