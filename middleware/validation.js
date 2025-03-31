const { body, validationResult } = require('express-validator');

// Validation result middleware
const validateResult = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// User registration validation rules
const registerValidation = [
  body('username')
    .isLength({ min: 3 })
    .withMessage('Username must be at least 3 characters long')
    .isAlphanumeric()
    .withMessage('Username must contain only letters and numbers'),
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*])/)
    .withMessage('Password must include one lowercase character, one uppercase character, a number, and a special character'),
  body('phoneNumber')
    .isMobilePhone()
    .withMessage('Please provide a valid phone number'),
  validateResult
];

// Login validation rules
const loginValidation = [
  body('username').notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validateResult
];

// Message creation validation
const messageValidation = [
  body('receiverId').notEmpty().withMessage('Receiver ID is required'),
  body('content')
    .if(body('mediaUrl').isEmpty())
    .notEmpty()
    .withMessage('Either message content or media is required'),
  validateResult
];

module.exports = {
  registerValidation,
  loginValidation,
  messageValidation,
  validateResult
}; 