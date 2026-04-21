const { sequelize } = require('../config/db');
const User = require('./User');
const Load = require('./Load');
const Bid = require('./Bid');
const Payment = require('./Payment');

// Associations
// A Load belongs to a Company (User)
Load.belongsTo(User, { as: 'company', foreignKey: 'companyId' });
User.hasMany(Load, { foreignKey: 'companyId' });

// A Load can have an assigned Driver (User)
Load.belongsTo(User, { as: 'assignedDriverUser', foreignKey: 'assignedDriverId' });

// A Bid belongs to a Load
Bid.belongsTo(Load, { as: 'load', foreignKey: 'loadId' });
Load.hasMany(Bid, { as: 'bids', foreignKey: 'loadId' });

// A Bid belongs to a Driver (User)
Bid.belongsTo(User, { as: 'driver', foreignKey: 'driverId' });
User.hasMany(Bid, { foreignKey: 'driverId' });

// Payment associations
Payment.belongsTo(Load, { as: 'load', foreignKey: 'loadId' });
Load.hasOne(Payment, { as: 'payment', foreignKey: 'loadId' });
Payment.belongsTo(User, { as: 'driver', foreignKey: 'driverId' });
Payment.belongsTo(User, { as: 'company', foreignKey: 'companyId' });

module.exports = {
  sequelize,
  User,
  Load,
  Bid,
  Payment
};

