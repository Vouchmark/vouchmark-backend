const mongoose = require("mongoose");

const visitorSchema = new mongoose.Schema(
  {
    ip: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
    },
    page: {
      type: String,
      required: true,
    },
    referrer: {
      type: String,
    },
    country: {
      type: String,
    },
    city: {
      type: String,
    },
    device: {
      type: String,
    },
    browser: {
      type: String,
    },
    os: {
      type: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const Visitor = mongoose.model("Visitor", visitorSchema);
module.exports = Visitor;
