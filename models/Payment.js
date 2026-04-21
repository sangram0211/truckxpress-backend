const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  loadId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true // one payment record per load
  },
  driverId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  companyId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pod_uploaded', 'pending_verification', 'verified', 'paid', 'disputed'),
    defaultValue: 'pod_uploaded'
  },
  podImagePath: {
    type: DataTypes.STRING,   // disk path to uploaded image
    allowNull: true
  },
  podImageOriginalName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  receiptNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Razorpay fields
  razorpayOrderId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  razorpayPaymentId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  razorpaySignature: {
    type: DataTypes.STRING,
    allowNull: true
  },
  paidAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  verifiedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  companyNote: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true,
  tableName: 'Payments'
});

module.exports = Payment;
