const { Load, User, Bid, Payment, sequelize } = require('../models');
const { Op } = require('sequelize');

exports.createLoad = async (req, res) => {
  try {
    const loadData = {
      ...req.body,
      companyId: req.user.id
    };
    const load = await Load.create(loadData);

    res.status(201).json({ success: true, data: load });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getLoads = async (req, res) => {
  try {
    let whereClause = {};
    if (req.user.role === 'company') {
      whereClause = { companyId: req.user.id };
    } else {
      whereClause = { status: { [Op.in]: ['posted', 'bidding'] } };
    }

    const loads = await Load.findAll({
      where: whereClause,
      include: [
        { model: User, as: 'company', attributes: ['name', 'companyName'] },
        { 
          model: Bid, 
          as: 'bids',
          include: [{ model: User, as: 'driver', attributes: ['name', 'rating'] }]
        }
      ]
    });
    
    res.status(200).json({ success: true, count: loads.length, data: loads });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getNearbyLoads = async (req, res) => {
  try {
    const { lng, lat, distance } = req.query; // max distance in km

    if (!lng || !lat) {
      return res.status(400).json({ success: false, error: 'Please provide lng and lat' });
    }

    const radius = distance || 50; // default 50km

    // Haversine formula in raw SQL to calculate distance
    const haversine = `(
      6371 * acos(
        cos(radians(${lat}))
        * cos(radians(originLat))
        * cos(radians(originLng) - radians(${lng}))
        + sin(radians(${lat})) * sin(radians(originLat))
      )
    )`;

    const loads = await Load.findAll({
      where: {
        status: { [Op.in]: ['posted', 'bidding'] }
      },
      attributes: {
        include: [[sequelize.literal(haversine), 'distance']]
      },
      having: sequelize.where(sequelize.literal(haversine), '<=', radius),
      order: sequelize.literal('distance ASC')
    });

    res.status(200).json({ success: true, count: loads.length, data: loads });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.placeBid = async (req, res) => {
  try {
    const load = await Load.findByPk(req.params.id);
    if (!load) return res.status(404).json({ success: false, error: 'Load not found' });
    if (load.status !== 'posted' && load.status !== 'bidding') {
      return res.status(400).json({ success: false, error: 'Load is no longer accepting bids' });
    }

    const { amount } = req.body;
    
    const bid = await Bid.create({
      loadId: load.id,
      driverId: req.user.id,
      amount
    });

    if (load.status === 'posted') {
      load.status = 'bidding';
      await load.save();
    }

    req.io.to(`company_${load.companyId}`).emit('new_bid', { loadId: load.id, amount, driverId: req.user.id });

    res.status(200).json({ success: true, data: bid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.acceptBid = async (req, res) => {
  try {
    const { bidId } = req.body;
    const load = await Load.findByPk(req.params.id);

    if (!load) return res.status(404).json({ success: false, error: 'Load not found' });
    if (load.companyId !== req.user.id) {
       return res.status(401).json({ success: false, error: 'Not authorized' });
    }

    const bid = await Bid.findOne({ where: { id: bidId, loadId: load.id } });
    if (!bid) return res.status(404).json({ success: false, error: 'Bid not found' });

    // Transaction to safely update everything
    await sequelize.transaction(async (t) => {
      bid.status = 'accepted';
      await bid.save({ transaction: t });

      load.assignedDriverId = bid.driverId;
      load.agreedRate = bid.amount;
      load.status = 'assigned';
      await load.save({ transaction: t });

      // Reject all other bids
      await Bid.update(
        { status: 'rejected' },
        { 
          where: { loadId: load.id, id: { [Op.ne]: bidId } },
          transaction: t
        }
      );
    });

    req.io.to(`driver_${bid.driverId}`).emit('bid_accepted', load);

    res.status(200).json({ success: true, data: load });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.acceptFixed = async (req, res) => {
  try {
    const load = await Load.findByPk(req.params.id);

    if (!load) return res.status(404).json({ success: false, error: 'Load not found' });
    if (!load.isFixedPrice) return res.status(400).json({ success: false, error: 'This load is open for bidding, not a fixed price' });
    if (load.status !== 'posted' && load.status !== 'bidding') return res.status(400).json({ success: false, error: 'Load is no longer available' });

    // Transaction to safely assign driver and create auto-accepted bid record
    await sequelize.transaction(async (t) => {
      // Reject any open bids from others since this driver grabbed it
      await Bid.update(
        { status: 'rejected' },
        { where: { loadId: load.id }, transaction: t }
      );

      // Create accepted bid history for this driver
      await Bid.create({
        loadId: load.id,
        driverId: req.user.id,
        amount: load.expectedRate,
        status: 'accepted'
      }, { transaction: t });

      load.assignedDriverId = req.user.id;
      load.agreedRate = load.expectedRate;
      load.status = 'assigned';
      await load.save({ transaction: t });
    });

    req.io.to(`company_${load.companyId}`).emit('new_bid', { loadId: load.id, amount: load.expectedRate, driverId: req.user.id, autoAccepted: true });

    res.status(200).json({ success: true, data: load, message: 'Fixed price load successfully accepted.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateLoadStatus = async (req, res) => {
  try {
    const load = await Load.findByPk(req.params.id);
    if (!load) return res.status(404).json({ success: false, error: 'Load not found' });

    const { status } = req.body;
    load.status = status;
    await load.save();

    // Broadcast update
    if (req.user.role === 'driver') {
      req.io.to(`company_${load.companyId}`).emit('load_status_update', load);
    } else {
      req.io.to(`driver_${load.assignedDriverId}`).emit('load_status_update', load);
    }

    res.status(200).json({ success: true, data: load });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getMyBids = async (req, res) => {
  try {
    const bids = await Bid.findAll({
      where: { driverId: req.user.id },
      include: [{ model: Load, as: 'load' }]
    });
    res.status(200).json({ success: true, count: bids.length, data: bids });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getActiveTrip = async (req, res) => {
  try {
    const activeLoad = await Load.findOne({
      where: { 
        assignedDriverId: req.user.id,
        status: { [Op.in]: ['assigned', 'in_transit'] }
      },
      include: [{ model: User, as: 'company', attributes: ['name', 'companyName'] }]
    });
    res.status(200).json({ success: true, data: activeLoad || null });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET driver's last known GPS position (saved by socket update_location events)
exports.getDriverLocation = async (req, res) => {
  try {
    const driver = await User.findByPk(req.params.driverId, {
      attributes: ['id', 'name', 'latitude', 'longitude']
    });
    if (!driver) return res.status(404).json({ success: false, error: 'Driver not found' });
    res.status(200).json({ success: true, data: { lat: driver.latitude, lng: driver.longitude } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/loads/driver-stats — Real-time stats for the driver dashboard
exports.getDriverStats = async (req, res) => {
  try {
    const driverId = req.user.id;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // All delivered loads for this driver
    const deliveredLoads = await Load.findAll({
      where: { assignedDriverId: driverId, status: 'delivered' },
      include: [{
        model: Payment,
        as: 'payment',
        required: false
      }],
      order: [['updatedAt', 'DESC']]
    });

    // Total trips completed
    const totalTrips = deliveredLoads.length;

    // Trips this month
    const tripsThisMonth = deliveredLoads.filter(l => new Date(l.updatedAt) >= monthStart).length;

    // Trips last month
    const tripsLastMonth = deliveredLoads.filter(l => {
      const d = new Date(l.updatedAt);
      return d >= lastMonthStart && d <= lastMonthEnd;
    }).length;

    // Earnings this month (from paid/verified payments)
    const earningsThisMonth = deliveredLoads
      .filter(l => new Date(l.updatedAt) >= monthStart && l.payment)
      .reduce((sum, l) => sum + (l.payment.amount || 0), 0);

    // Earnings last month
    const earningsLastMonth = deliveredLoads
      .filter(l => {
        const d = new Date(l.updatedAt);
        return d >= lastMonthStart && d <= lastMonthEnd && l.payment;
      })
      .reduce((sum, l) => sum + (l.payment.amount || 0), 0);

    // Pending payment (active trip with agreed rate)
    const pendingPayment = await Payment.findOne({
      where: { driverId, status: { [Op.in]: ['pending_verification', 'pod_uploaded'] } },
      include: [{ model: Load, as: 'load', attributes: ['id', 'originAddress', 'destAddress'] }],
      order: [['createdAt', 'DESC']]
    });

    // Total lifetime earnings
    const totalEarnings = deliveredLoads
      .filter(l => l.payment)
      .reduce((sum, l) => sum + (l.payment.amount || 0), 0);

    // Weekly earnings (last 7 days, Mon-Sun of current week)
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyData = weekDays.map((day, idx) => {
      const dayStart = new Date(now);
      const diff = idx - now.getDay();
      dayStart.setDate(now.getDate() + diff);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      const earned = deliveredLoads
        .filter(l => {
          const d = new Date(l.updatedAt);
          return d >= dayStart && d <= dayEnd && l.payment;
        })
        .reduce((sum, l) => sum + (l.payment.amount || 0), 0);
      return { day, earned };
    });

    // Trip history (last 20 delivered trips)
    const tripHistory = deliveredLoads.slice(0, 20).map(l => ({
      id: l.id,
      originAddress: l.originAddress,
      destAddress: l.destAddress,
      goodsType: l.goodsType,
      weight: l.weight,
      date: l.updatedAt,
      earned: l.payment ? l.payment.amount : (l.agreedRate || l.expectedRate || 0),
      paymentStatus: l.payment ? l.payment.status : 'pending',
      receiptNumber: l.payment ? l.payment.receiptNumber : null,
      utr: l.payment ? l.payment.razorpayPaymentId : null,
      payoutMethod: l.payment ? null : null
    }));

    // Recent activity (last 5 events — payments + delivered loads)
    const recentPayments = await Payment.findAll({
      where: { driverId },
      include: [{ model: Load, as: 'load', attributes: ['id', 'originAddress', 'destAddress'] }],
      order: [['updatedAt', 'DESC']],
      limit: 5
    });

    const recentActivity = recentPayments.map(p => {
      if (p.status === 'paid') {
        return {
          type: 'payment',
          text: `₹${p.amount.toLocaleString('en-IN')} payment received — TXP-${p.loadId}`,
          time: p.paidAt || p.updatedAt,
          color: 'var(--green)'
        };
      } else if (p.status === 'verified') {
        return {
          type: 'verified',
          text: `Delivery verified for TXP-${p.loadId} — Payment pending`,
          time: p.verifiedAt || p.updatedAt,
          color: 'var(--amber)'
        };
      } else {
        return {
          type: 'pod',
          text: `Delivery proof uploaded for TXP-${p.loadId} — Awaiting verification`,
          time: p.updatedAt,
          color: 'var(--dr)'
        };
      }
    });

    // Driver profile
    const driver = await User.findByPk(driverId, {
      attributes: { exclude: ['password'] }
    });

    res.status(200).json({
      success: true,
      data: {
        earningsThisMonth,
        earningsLastMonth,
        totalEarnings,
        totalTrips,
        tripsThisMonth,
        tripsLastMonth,
        rating: driver.rating || 5.0,
        weeklyData,
        tripHistory,
        recentActivity,
        pendingPayment: pendingPayment ? {
          amount: pendingPayment.amount,
          loadId: pendingPayment.loadId,
          route: pendingPayment.load ? `${pendingPayment.load.originAddress} → ${pendingPayment.load.destAddress}` : ''
        } : null
      }
    });
  } catch (error) {
    console.error('getDriverStats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
