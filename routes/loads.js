const express = require('express');
const { createLoad, getLoads, getNearbyLoads, placeBid, acceptBid, acceptFixed, updateLoadStatus, getMyBids, getActiveTrip, getDriverLocation, getDriverStats } = require('../controllers/loadController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect); // All routes require authentication

router.post('/', authorize('company'), createLoad); // Companies create loads
router.get('/', getLoads); // Both companies and drivers can get loads
router.get('/nearby', authorize('driver'), getNearbyLoads); // Drivers get nearby loads
router.get('/my-bids', authorize('driver'), getMyBids); // Drivers get their placed bids
router.get('/active-trip', authorize('driver'), getActiveTrip); // Drivers get their accepted trips
router.get('/driver-stats', authorize('driver'), getDriverStats); // Drivers get dashboard statistics

router.post('/:id/bid', authorize('driver'), placeBid);
router.post('/:id/accept-bid', authorize('company'), acceptBid);
router.post('/:id/accept-fixed', authorize('driver'), acceptFixed);
router.put('/:id/status', updateLoadStatus); // Both can update status (e.g. driver marks delivered)
router.get('/driver-location/:driverId', authorize('company'), getDriverLocation); // Company fetches driver last GPS

module.exports = router;
