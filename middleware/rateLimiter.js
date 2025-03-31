const rateLimit = require('express-rate-limit');
const accountsByIP = new Map();
require('dotenv').config();

const EXCLUDED_IP = process.env.EXCLUDED_IP;

const apiLimiter = (req, res, next) => {
  if (req.ip === EXCLUDED_IP) {
    return next();
  }
  return rateLimit({
    windowMs: 10 * 60 * 1000, 
    max: 60, 
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "You're making too many requests! Please wait a bit before trying again." }
  })(req, res, next);
};

const authLimiter = (req, res, next) => {
  if (req.ip === EXCLUDED_IP) {
    return next();
  }
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many login attempts. Please wait 15 minutes before trying again to protect your account." }
  })(req, res, next);
};

const createAccountLimiter = (req, res, next) => {
  const ip = req.ip;

  if (ip === EXCLUDED_IP) {
    return next();
  }

  if (!accountsByIP.has(ip)) {
    accountsByIP.set(ip, 0);
  }

  if (accountsByIP.get(ip) >= 5) {
    return res.status(429).json({ error: "You have reached the maximum allowed accounts from this IP. Please use an existing account." });
  }

  accountsByIP.set(ip, accountsByIP.get(ip) + 1);
  next();
};

module.exports = {
  apiLimiter,
  authLimiter,
  createAccountLimiter
};
