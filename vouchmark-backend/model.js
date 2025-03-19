const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { text } = require("pdfkit");
require("dotenv").config();
const { MONGO_URI } = process.env;
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    console.error("Connection string:", MONGO_URI);
  });

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    unique: true,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    unique: true,
    required: true,
  },
  verifiedEmail: Boolean,
  company_name: String,
  phone_no: String,
  address: String,
  state: String,
  zip_code: String,
  country: String,
  timezone: String,
  authMode: {
    type: String,
    enum: ["email", "google", "facebook"],
  },
  verify_company_otp: {
    type: Number,
  },
  password: String,
  date_created: {
    type: Date,
    default: Date.now,
  },
  free_trial: {
    type: Number,
    default: 0,
  },
  role: {
    type: String,
    enum: ["admin", "moderator", "viewer", "normal"],
    default: "normal",
  },
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  console.log("this password", this.password);
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.pre("findOneAndUpdate", async function (next) {
  const update = this.getUpdate();

  if (update && update.password) {
    // Check if password is being updated
    console.log("working cool");

    const salt = await bcrypt.genSalt(10);
    update.password = await bcrypt.hash(update.password, salt);
  }
  next();
});

const User = mongoose.model("User", userSchema);

const companySchema = new mongoose.Schema({
  ownerId: {
    type: String,
    unique: true,
  },
  owner_bank_id: {
    type: String,
  },
  bank_account_name: String,
  bank_account_number: String,
  bank_name: String,
  id: { type: String, required: true, unique: true },
  companyName: String,
  businessCommencementDate: String,
  registrationApproved: Boolean,
  rcNumber: { type: String },
  email: String,
  phone: String,
  vouchEmail: String,
  address: String,
  vouchAddress: String,
  city: String,
  vouchCity: String,
  lga: String,
  vouchLga: String,
  state: String,
  vouchState: String,
  postcode: String,
  vouchPostcode: String,
  registrationDate: String,
  registrarInfo: {
    surname: String,
    firstname: String,
    email: String,
    address: String,
    city: String,
    state: String,
    contact_address: String,
    phone_NUMBER: String,
    date_of_birth: Date,
    nationality: String,
  },
  shareHolderDetails: [
    {
      name: String,
      address: String,
      dateOfBirth: Date,
      nationality: String,
      idType: String,
      percentageOfOwner: Number,
      noOfShares: Number,
      identificationNumber: String,
      phoneNumber: String,
    },
  ],
  shareHolderVerified: Boolean,
  natureOfBUsiness: String,
  vouchNatureOfBUsiness: String,
  bussiness_category: String,
  vouchBussiness_category: String,
  businessDescription: String,
  shareCapital: Number,
  vouchShareCapital: Number,
  shareCapitalInWords: String,
  vouchShareCapitalInWords: String,
  dividedInto: String,
  vouchDividedInto: String,
  firsTin: String,
  active: Boolean,
  head_office_address: String,
  vouchHead_office_address: String,
  company_classification: String,
  search_view_count: { type: Number, default: 0 },
  view_count: { type: Number, default: 0 },
  companyDetails: {
    type: Boolean,
    default: false,
  },
  vouchmark_tools: {
    vouch_mark: {
      type: Number,
      default: 0,
    },
    activeBank: Boolean,
    social_verified: Boolean,
    // bank_vr_score: {
    //   bvn_score: Number,
    //   account_present_score: Number,
    //   transactions_score: Number,
    //   balance_score: Number
    // },
    // rcNumber_vr_score: Number,
    // firsTin_vr_score: Number,
    // address_vr_score: Number,
    // website_vr_score: Number, // check if it is secured
  },
  facebook: String,
  instagram: String,
  linkedin: String,
  twitter: String,
  website: String,
  tiktok: String,
  country: String,
  website_verified: {
    type: Boolean,
    default: false,
  },
  firstin_vr: {
    type: Boolean,
  },
  firstaxClearance_vr: {
    type: Boolean,
    default: false,
  },
  bill_verfied: Boolean,
  bill_verfied_date: Date,
  cacert_verified: {
    type: Boolean,
    default: false,
  },
  cacreport_verified: {
    type: Boolean,
    default: false,
  },
  utilityBillUrl: String,
  tinDocumentUrl: String,
  cacCertificateUrl: String,
  cacReportUrl: String,
  utilityBillUploadDate: Date,
  tinDocumentUploadDate: Date,
  cacCertificateUploadDate: Date,
  cacReportUploadDate: Date,
});

const Company = mongoose.model("Company", companySchema);

const newsletterSubscriberSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  ip: String,
});

const NewsletterSubscriber = mongoose.model(
  "NewsletterSubscriber",
  newsletterSubscriberSchema
);

const activePlanSchema = new mongoose.Schema({
  userId: {
    type: String,
    unique: true,
  },
  plan: {
    type: String,
    enum: ["basic", "business"],
    required: true,
  },
  free_trial: {
    default: false,
    type: Boolean,
  },
  start_date: {
    type: Date,
  },
  end_date: {
    type: Date,
  },
});

const ActivePlan = mongoose.model("ActivePlan", activePlanSchema);

const paymentSchema = new mongoose.Schema(
  {
    userId: String,
    referenceNumber: String,
    amount: Number,
    plan: {
      type: String,
      enum: ["basic", "business"],
      required: true,
    },
    start_date: {
      type: Date,
    },
    end_date: {
      type: Date,
    },
    datePaid: Date,
    email: String,
  },
  { timestamps: true }
);

const Payment = mongoose.model("Payment", paymentSchema);

const searchSchema = new mongoose.Schema({
  companyId: String,
  userId: String,
  searchDate: Date,
});

const Search = mongoose.model("Search", searchSchema);

const paidCompanyViewSchema = new mongoose.Schema({
  companyId: String,
  userId: {
    type: String,
  },
  viewDate: Date,
});

const PaidCompanyView = mongoose.model(
  "PaidCompanyView",
  paidCompanyViewSchema
);

module.exports = {
  User,
  Company,
  NewsletterSubscriber,
  Payment,
  Search,
  PaidCompanyView,
  ActivePlan,
};
