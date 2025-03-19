const express = require("express");
const router = express.Router();
const Visitor = require("../models/Visitor");
const axios = require("axios");
const crypto = require("crypto");

// Track visitor
router.post("/track", async (req, res) => {
  try {
    const { page, referrer } = req.body;

    const ip =
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      (req.connection.socket ? req.connection.socket.remoteAddress : null);

    const userAgent = req.headers["user-agent"];

    const visitorId = crypto
      .createHash("md5")
      .update(ip + userAgent)
      .digest("hex");

    const device = parseDevice(userAgent);
    const browser = parseBrowser(userAgent);
    const os = parseOS(userAgent);

    let country = "Unknown";
    let city = "Unknown";

    try {
      // Use ipapi.co for geolocation (10,000 requests per month free)
      const geoResponse = await axios.get(`https://ipapi.co/${ip}/json/`);
      if (geoResponse.data) {
        country = geoResponse.data.country_name;
        city = geoResponse.data.city;
      }
    } catch (geoError) {
      // Fallback to ip-api.com if ipapi.co fails
      try {
        const fallbackResponse = await axios.get(
          `http://ip-api.com/json/${ip}`
        );
        if (
          fallbackResponse.data &&
          fallbackResponse.data.status === "success"
        ) {
          country = fallbackResponse.data.country;
          city = fallbackResponse.data.city;
        }
      } catch (fallbackError) {
        console.log("Error getting location data:", fallbackError.message);
      }
    }

    // Check if this visitor already exists
    const existingVisitor = await Visitor.findOne({ visitorId });

    if (existingVisitor) {
      // Update the last visit time and page info for returning visitors
      existingVisitor.lastVisit = new Date();
      existingVisitor.page = page || req.headers.referer || "/";
      existingVisitor.referrer = referrer || req.headers.referer || "";
      await existingVisitor.save();
    } else {
      // Create new visitor record for first-time visitors
      const visitor = new Visitor({
        visitorId,
        ip,
        userAgent,
        page: page || req.headers.referer || "/",
        referrer: referrer || req.headers.referer || "",
        country,
        city,
        device,
        browser,
        os,
      });

      await visitor.save();
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Visitor tracking error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// Helper functions to parse user agent
function parseDevice(userAgent) {
  if (!userAgent) return "Unknown";

  if (/mobile/i.test(userAgent)) return "Mobile";
  if (/tablet/i.test(userAgent)) return "Tablet";
  if (/ipad/i.test(userAgent)) return "Tablet";
  return "Desktop";
}

function parseBrowser(userAgent) {
  if (!userAgent) return "Unknown";

  if (/chrome/i.test(userAgent)) return "Chrome";
  if (/firefox/i.test(userAgent)) return "Firefox";
  if (/safari/i.test(userAgent)) return "Safari";
  if (/edge/i.test(userAgent)) return "Edge";
  if (/opera/i.test(userAgent) || /opr/i.test(userAgent)) return "Opera";
  if (/msie/i.test(userAgent) || /trident/i.test(userAgent))
    return "Internet Explorer";
  return "Unknown";
}

function parseOS(userAgent) {
  if (!userAgent) return "Unknown";

  if (/windows/i.test(userAgent)) return "Windows";
  if (/macintosh|mac os x/i.test(userAgent)) return "MacOS";
  if (/linux/i.test(userAgent)) return "Linux";
  if (/android/i.test(userAgent)) return "Android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "iOS";
  return "Unknown";
}

module.exports = router;
