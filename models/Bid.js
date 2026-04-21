const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Bid = sequelize.define('Bid', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  amount: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'accepted', 'rejected'),
    defaultValue: 'pending'
  }
}, {
  timestamps: true,
  tableName: 'Bids'
});

module.exports = Bid;
