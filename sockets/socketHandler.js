const { User } = require('../models');

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // User joins their own room to receive private notifications
    socket.on('join', (data) => {
      const { userId, role } = data;
      if (userId && role) {
        socket.join(`${role}_${userId}`);
        console.log(`User ${userId} joined room ${role}_${userId}`);
      }
    });

    // Driver updates location
    socket.on('update_location', async (data) => {
      const { userId, lng, lat, loadId } = data;
      
      try {
        await User.update(
          { longitude: lng, latitude: lat },
          { where: { id: userId } }
        );

        // Broadcast to ALL connected clients (including company dashboard) tracking this load
        if (loadId) {
          io.emit(`track_${loadId}`, { lng, lat, speed: data.speed || 0 });
        }
      } catch (err) {
        console.error('Location update error:', err);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};
