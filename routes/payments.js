const express = require('express');
const multer = require('multer');
const path = require('path');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

const {
  uploadPOD,
  getPayment,
  getMyPayments,
  verifyDelivery,
  payDriverDirectly,
  getPodImage,
  saveBankDetails,
  getPayoutStatus
} = require('../controllers/paymentController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// ── Cloudinary Config ─────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Multer + Cloudinary Storage ───────────────────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'truckxpress/pods',
    public_id: `pod-load${req.params.loadId}-${Date.now()}`,
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'heic'],
    transformation: [{ quality: 'auto', fetch_format: 'auto' }],
  }),
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|heic/;
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.test(ext)) cb(null, true);
  else cb(new Error('Only image files are allowed (jpg, png, webp, heic)'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// All routes require auth
router.use(protect);

// ── Driver routes ─────────────────────────────────────────────────
router.put('/save-bank-details', authorize('driver'), saveBankDetails);             // Driver saves UPI/bank
router.get('/payout-status', authorize('driver'), getPayoutStatus);                 // Driver checks registration
router.post('/upload-pod/:loadId', authorize('driver'), upload.single('podImage'), uploadPOD); // Driver uploads POD

// ── Shared / Company routes ───────────────────────────────────────
router.get('/', getMyPayments);                                                     // All payments for user
router.get('/:loadId', getPayment);                                                 // Payment for specific load
router.get('/:loadId/pod-image', getPodImage);                                      // Serve POD image
router.put('/:loadId/verify', authorize('company'), verifyDelivery);                // Company verifies delivery
router.post('/:loadId/pay-driver', authorize('company'), payDriverDirectly);        // Company pays driver directly

module.exports = router;
