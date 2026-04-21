const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Load = sequelize.define('Load', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  originAddress: {
    type: DataTypes.STRING,
    allowNull: false
  },
  originLat: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  originLng: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  destAddress: {
    type: DataTypes.STRING,
    allowNull: false
  },
  destLat: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  destLng: {
    type: DataTypes.FLOAT,
    allowNull: false
  },
  weight: {
    type: DataTypes.FLOAT, // in tons
    allowNull: false
  },
  goodsType: {
    type: DataTypes.STRING,
    allowNull: false
  },
  expectedRate: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('posted', 'bidding', 'assigned', 'in_transit', 'delivered', 'cancelled'),
    defaultValue: 'posted'
  },
  agreedRate: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  pickupDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  deliveryDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  isFixedPrice: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  timestamps: true,
  tableName: 'Loads'
});

module.exports = Load;
