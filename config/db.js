const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

// Aiven and most cloud MySQL providers require SSL
const isProduction = process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true';

const sequelize = process.env.DB_URI
  ? new Sequelize(process.env.DB_URI, {
      dialect: 'mysql',
      logging: false,
      dialectOptions: isProduction ? { ssl: { require: true, rejectUnauthorized: false } } : {}
    })
  : new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASS,
      {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        dialect: 'mysql',
        logging: false,
        dialectOptions: isProduction ? { ssl: { require: true, rejectUnauthorized: false } } : {}
      }
    );

const connectDB = async () => {
  try {
    console.log(`\n⏳ Attempting to connect to MySQL...`);
    console.log(`   Host: ${process.env.DB_HOST || 'Using DB_URI'}`);
    console.log(`   Port: ${process.env.DB_PORT || (process.env.DB_URI ? '' : '3306 - AIVEN WILL EXPIRE/TIMEOUT IF THIS IS NOT CHANGED!')}`);
    
    await sequelize.authenticate();
    console.log('✅ MySQL Database Connected successfully via Sequelize.\n');
  } catch (error) {
    console.error('\n❌ Unable to connect to the database. Error details:');
    console.error(error);
    process.exit(1); 
  }
};

module.exports = { sequelize, connectDB };
