const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

// Aiven and most cloud MySQL providers require SSL
const isProduction = process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true';

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
    dialectOptions: isProduction ? {
      ssl: {
        require: true,
        rejectUnauthorized: false // Aiven uses self-signed certs
      }
    } : {}
  }
);

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('MySQL Database Connected successfully via Sequelize.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1); // Crash the server so Render shows the error clearly
  }
};

module.exports = { sequelize, connectDB };
