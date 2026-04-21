const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  role: {
    type: DataTypes.ENUM('company', 'driver'),
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Company specific
  companyName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Driver specific
  truckType: {
    type: DataTypes.STRING,
    allowNull: true
  },
  truckCapacity: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  licenseNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // GPS tracking
  latitude: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  longitude: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  rating: {
    type: DataTypes.FLOAT,
    defaultValue: 5.0
  },
  // ── Payout Details (driver bank / UPI) ─────────────────────────
  payoutMethod: {
    type: DataTypes.ENUM('upi', 'bank_account'),
    allowNull: true
  },
  upiId: {
    type: DataTypes.STRING,
    allowNull: true   // e.g. driver@upi
  },
  bankAccountHolderName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bankAccountNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bankIFSC: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bankAccountType: {
    type: DataTypes.ENUM('savings', 'current'),
    defaultValue: 'savings',
    allowNull: true
  },
  // Razorpay Contact & Fund Account IDs (created once, reused for all payouts)
  razorpayContactId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  razorpayFundAccountId: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  timestamps: true,
  tableName: 'Users'
});

module.exports = User;

