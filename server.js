const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

// Import DB config and models
const { connectDB } = require('./config/db');
const { sequelize } = require('./models');

dotenv.config();

const app = express();
const server = http.createServer(app);

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Add context to req
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Database Connection & Sync
connectDB().then(async () => {
  // Sync models with database
  await sequelize.sync({ alter: true });
  console.log('MySQL Database synched.');
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/loads', require('./routes/loads'));
app.use('/api/payments', require('./routes/payments'));

// Serve uploaded POD images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Basic health check route
app.get('/', (req, res) => res.send('TruckXpress API is running with MySQL'));

// Socket.io connection logic
require('./sockets/socketHandler')(io);

const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} and bound to 0.0.0.0`);
});
