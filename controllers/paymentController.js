const { Payment, Load, User } = require('../models');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const path = require('path');
const axios = require('axios');

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret'
});

// Razorpay Payouts base URL (uses Basic Auth with key:secret)
const RZP_PAYOUT_BASE = 'https://api.razorpay.com/v1';

function rzpAuth() {
  return {
    username: process.env.RAZORPAY_KEY_ID,
    password: process.env.RAZORPAY_KEY_SECRET
  };
}

function generateReceiptNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `TXP-RCP-${y}${m}${d}-${rand}`;
}

// ─────────────────────────────────────────────────────────────────
// DRIVER: Save / update payout account details
// PUT /api/payments/save-bank-details
// ─────────────────────────────────────────────────────────────────
exports.saveBankDetails = async (req, res) => {
  try {
    const driver = await User.findByPk(req.user.id);
    if (!driver || driver.role !== 'driver') {
      return res.status(403).json({ success: false, error: 'Only drivers can save payout details' });
    }

    const { payoutMethod, upiId, bankAccountHolderName, bankAccountNumber, bankIFSC, bankAccountType, phone } = req.body;

    if (!payoutMethod) return res.status(400).json({ success: false, error: 'payoutMethod is required (upi or bank_account)' });

    if (payoutMethod === 'upi' && !upiId) {
      return res.status(400).json({ success: false, error: 'UPI ID is required' });
    }
    if (payoutMethod === 'bank_account' && (!bankAccountNumber || !bankIFSC || !bankAccountHolderName)) {
      return res.status(400).json({ success: false, error: 'Bank account number, IFSC and account holder name are required' });
    }

    // Update driver record
    driver.payoutMethod = payoutMethod;
    driver.phone = phone || driver.phone;
    if (payoutMethod === 'upi') {
      driver.upiId = upiId;
    } else {
      driver.bankAccountHolderName = bankAccountHolderName;
      driver.bankAccountNumber = bankAccountNumber;
      driver.bankIFSC = bankIFSC.toUpperCase();
      driver.bankAccountType = bankAccountType || 'savings';
    }

    // Reset Razorpay IDs so they get re-created with new account details
    driver.razorpayContactId = null;
    driver.razorpayFundAccountId = null;

    await driver.save();

    // Pre-create Razorpay Contact & Fund Account now
    try {
      await ensureRazorpayFundAccount(driver);
    } catch (rzpErr) {
      // Don't fail — we'll retry on first payout
      console.warn('Razorpay setup warning (will retry on payout):', rzpErr.message);
    }

    const updatedDriver = await User.findByPk(driver.id, {
      attributes: { exclude: ['password', 'razorpayContactId', 'razorpayFundAccountId'] }
    });

    res.status(200).json({
      success: true,
      data: updatedDriver,
      message: `Payout details saved! Payments will go directly to your ${payoutMethod === 'upi' ? 'UPI ID' : 'bank account'}.`
    });
  } catch (err) {
    console.error('saveBankDetails error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// Internal: Ensure Razorpay Contact + Fund Account exist for driver
// ─────────────────────────────────────────────────────────────────
async function ensureRazorpayFundAccount(driver) {
  // 1. Create Contact if not exists
  if (!driver.razorpayContactId) {
    const contactPayload = {
      name: driver.name,
      email: driver.email,
      contact: driver.phone || '9999999999',
      type: 'vendor',
      reference_id: `driver_${driver.id}`,
      notes: { driverId: String(driver.id) }
    };
    const contactRes = await axios.post(`${RZP_PAYOUT_BASE}/contacts`, contactPayload, { auth: rzpAuth() });
    driver.razorpayContactId = contactRes.data.id;
    await driver.save();
  }

  // 2. Create Fund Account if not exists
  if (!driver.razorpayFundAccountId) {
    let fundPayload = {
      contact_id: driver.razorpayContactId,
      account_type: driver.payoutMethod || 'vpa'
    };

    if (driver.payoutMethod === 'upi') {
      fundPayload.account_type = 'vpa';
      fundPayload.vpa = { address: driver.upiId };
    } else {
      fundPayload.account_type = 'bank_account';
      fundPayload.bank_account = {
        name: driver.bankAccountHolderName,
        ifsc: driver.bankIFSC,
        account_number: driver.bankAccountNumber
      };
    }

    const faRes = await axios.post(`${RZP_PAYOUT_BASE}/fund_accounts`, fundPayload, { auth: rzpAuth() });
    driver.razorpayFundAccountId = faRes.data.id;
    await driver.save();
  }

  return driver;
}

// ─────────────────────────────────────────────────────────────────
// GET /api/payments/driver-payout-status
// Driver checks their payout account registration status
// ─────────────────────────────────────────────────────────────────
exports.getPayoutStatus = async (req, res) => {
  try {
    const driver = await User.findByPk(req.user.id, {
      attributes: ['id', 'payoutMethod', 'upiId', 'bankAccountHolderName', 'bankAccountNumber', 'bankIFSC', 'bankAccountType', 'razorpayFundAccountId']
    });
    res.status(200).json({
      success: true,
      data: {
        isRegistered: !!(driver.payoutMethod && (driver.upiId || driver.bankAccountNumber)),
        payoutMethod: driver.payoutMethod,
        upiId: driver.upiId,
        bankAccountHolderName: driver.bankAccountHolderName,
        bankAccountNumber: driver.bankAccountNumber ? '••••' + driver.bankAccountNumber.slice(-4) : null,
        bankIFSC: driver.bankIFSC,
        bankAccountType: driver.bankAccountType,
        fundAccountLinked: !!driver.razorpayFundAccountId
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// COMPANY: Pay driver directly via Razorpay Payout
// POST /api/payments/:loadId/pay-driver
// ─────────────────────────────────────────────────────────────────
exports.payDriverDirectly = async (req, res) => {
  try {
    const payment = await Payment.findOne({ where: { loadId: req.params.loadId } });
    if (!payment) return res.status(404).json({ success: false, error: 'Payment record not found' });
    if (payment.companyId !== req.user.id) return res.status(403).json({ success: false, error: 'Not authorized' });
    if (payment.status !== 'verified') {
      return res.status(400).json({ success: false, error: 'Delivery must be verified before payment. Current status: ' + payment.status });
    }

    // Get driver's payout details
    let driver = await User.findByPk(payment.driverId);
    if (!driver) return res.status(404).json({ success: false, error: 'Driver not found' });

    if (!driver.payoutMethod || (!driver.upiId && !driver.bankAccountNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Driver has not registered their payout account (bank/UPI) yet. Please ask them to add payout details in their profile.'
      });
    }

    // Ensure Razorpay Contact + Fund Account exist
    driver = await ensureRazorpayFundAccount(driver);

    const amountInPaise = Math.round(payment.amount * 100);

    // Create Razorpay Payout
    const payoutPayload = {
      account_number: process.env.RAZORPAY_ACCOUNT_NUMBER || '2323230061822316', // test account
      fund_account_id: driver.razorpayFundAccountId,
      amount: amountInPaise,
      currency: 'INR',
      mode: driver.payoutMethod === 'upi' ? 'UPI' : 'NEFT',
      purpose: 'payout',
      queue_if_low_balance: true,
      reference_id: payment.receiptNumber,
      narration: `TruckXpress Trip TXP-${payment.loadId} Payment`,
      notes: {
        loadId: String(payment.loadId),
        receiptNumber: payment.receiptNumber,
        driverName: driver.name
      }
    };

    const payoutRes = await axios.post(`${RZP_PAYOUT_BASE}/payouts`, payoutPayload, { auth: rzpAuth() });
    const payout = payoutRes.data;

    // Mark payment as paid
    payment.status = 'paid';
    payment.razorpayPaymentId = payout.id;   // payout ID
    payment.razorpayOrderId = payout.fund_account_id;
    payment.paidAt = new Date();
    await payment.save();

    // Notify driver via socket
    req.io.to(`driver_${payment.driverId}`).emit('payment_received', {
      loadId: payment.loadId,
      amount: payment.amount,
      paymentId: payout.id,
      receiptNumber: payment.receiptNumber,
      payoutMethod: driver.payoutMethod,
      destination: driver.payoutMethod === 'upi' ? driver.upiId : ('••••' + driver.bankAccountNumber.slice(-4))
    });

    res.status(200).json({
      success: true,
      data: {
        payment,
        payout: {
          id: payout.id,
          status: payout.status,
          amount: payment.amount,
          mode: payout.mode,
          utr: payout.utr || null
        }
      },
      message: `₹${payment.amount.toLocaleString('en-IN')} sent directly to driver's ${driver.payoutMethod === 'upi' ? 'UPI' : 'bank account'}!`
    });
  } catch (err) {
    console.error('payDriverDirectly error:', err.response?.data || err.message);
    const rzpError = err.response?.data?.error?.description || err.message;
    res.status(500).json({ success: false, error: rzpError });
  }
};

// ─────────────────────────────────────────────────────────────────
// POST /api/payments/upload-pod/:loadId  — Driver uploads POD
// ─────────────────────────────────────────────────────────────────
exports.uploadPOD = async (req, res) => {
  try {
    const loadId = req.params.loadId;
    const load = await Load.findByPk(loadId, {
      include: [{ model: User, as: 'company', attributes: ['id', 'name', 'companyName'] }]
    });

    if (!load) return res.status(404).json({ success: false, error: 'Load not found' });
    if (load.assignedDriverId !== req.user.id) return res.status(403).json({ success: false, error: 'Not your load' });
    if (!req.file) return res.status(400).json({ success: false, error: 'Please upload a delivery proof image' });

    load.status = 'delivered';
    await load.save();

    req.io.to(`company_${load.companyId}`).emit('delivery_proof_uploaded', { loadId: load.id, driverId: req.user.id });

    const receiptNumber = generateReceiptNumber();
    // Cloudinary returns the public URL in req.file.path
    const imageUrl = req.file.path;

    const [payment, created] = await Payment.findOrCreate({
      where: { loadId: load.id },
      defaults: {
        driverId: req.user.id,
        companyId: load.companyId,
        amount: load.agreedRate || load.expectedRate,
        status: 'pending_verification',
        podImagePath: imageUrl,
        podImageOriginalName: req.file.originalname,
        receiptNumber
      }
    });

    if (!created) {
      payment.podImagePath = imageUrl;
      payment.podImageOriginalName = req.file.originalname;
      payment.status = 'pending_verification';
      if (!payment.receiptNumber) payment.receiptNumber = receiptNumber;
      await payment.save();
    }

    res.status(200).json({ success: true, data: payment, message: 'Proof of delivery uploaded successfully!' });
  } catch (error) {
    console.error('uploadPOD error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// GET /api/payments/:loadId
// ─────────────────────────────────────────────────────────────────
exports.getPayment = async (req, res) => {
  try {
    const payment = await Payment.findOne({
      where: { loadId: req.params.loadId },
      include: [
        { model: Load, as: 'load', include: [{ model: User, as: 'company', attributes: ['name', 'companyName'] }] },
        { model: User, as: 'driver', attributes: ['id', 'name', 'email', 'truckType', 'licenseNumber', 'payoutMethod', 'upiId', 'bankAccountNumber', 'bankIFSC', 'razorpayFundAccountId'] },
        { model: User, as: 'company', attributes: ['id', 'name', 'companyName', 'email'] }
      ]
    });
    if (!payment) return res.status(404).json({ success: false, error: 'No payment record found for this load' });
    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// GET /api/payments — All payments for current user
// ─────────────────────────────────────────────────────────────────
exports.getMyPayments = async (req, res) => {
  try {
    const whereClause = req.user.role === 'company' ? { companyId: req.user.id } : { driverId: req.user.id };
    const payments = await Payment.findAll({
      where: whereClause,
      include: [
        { model: Load, as: 'load', attributes: ['id', 'originAddress', 'destAddress', 'goodsType', 'weight', 'agreedRate'] },
        { model: User, as: 'driver', attributes: ['id', 'name', 'truckType'] },
      ],
      order: [['createdAt', 'DESC']]
    });
    res.status(200).json({ success: true, count: payments.length, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// PUT /api/payments/:loadId/verify — Company verifies delivery
// ─────────────────────────────────────────────────────────────────
exports.verifyDelivery = async (req, res) => {
  try {
    const payment = await Payment.findOne({ where: { loadId: req.params.loadId } });
    if (!payment) return res.status(404).json({ success: false, error: 'Payment record not found' });
    if (payment.companyId !== req.user.id) return res.status(403).json({ success: false, error: 'Not authorized' });
    if (payment.status !== 'pending_verification') {
      return res.status(400).json({ success: false, error: `Payment is already in status: ${payment.status}` });
    }

    payment.status = 'verified';
    payment.verifiedAt = new Date();
    payment.companyNote = req.body.note || null;
    await payment.save();

    req.io.to(`driver_${payment.driverId}`).emit('payment_verified', { loadId: payment.loadId, amount: payment.amount });
    res.status(200).json({ success: true, data: payment, message: 'Delivery verified! You can now release the payment.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// GET /api/payments/:loadId/pod-image — Serve POD image
// ─────────────────────────────────────────────────────────────────
exports.getPodImage = async (req, res) => {
  try {
    const payment = await Payment.findOne({ where: { loadId: req.params.loadId } });
    if (!payment || !payment.podImagePath) return res.status(404).json({ success: false, error: 'No proof of delivery image found' });
    if (req.user.id !== payment.companyId && req.user.id !== payment.driverId) return res.status(403).json({ success: false, error: 'Not authorized' });
    // podImagePath now holds a Cloudinary URL — redirect directly to it
    res.redirect(payment.podImagePath);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────
// GET /api/loads/driver-location/:driverId — Last GPS (keep for compatibility)
// ─────────────────────────────────────────────────────────────────
// (This is already in loadController.js — no duplicate needed)
