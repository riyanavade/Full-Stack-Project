const express = require('express');
const Booking = require('../models/Booking');
const Driver = require('../models/Driver');
const jwt = require('jsonwebtoken');

const router = express.Router();

const verifyToken = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ message: 'Access denied' });
    try {
        const verified = jwt.verify(token.replace('Bearer ', ''), process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ message: 'Invalid token' });
    }
};

// Book a ride
router.post('/book', verifyToken, async (req, res) => {
    try {
        const { pickupLocation, dropoffLocation, fare } = req.body;
        
        // Try to find nearest available driver using geospatial query
        let nearestDriver = null;
        try {
            nearestDriver = await Driver.findOne({
                isAvailable: true,
                location: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [pickupLocation.lng, pickupLocation.lat]
                        },
                        $maxDistance: 10000 // 10km radius
                    }
                }
            });
        } catch (geoErr) {
            // If geospatial query fails (e.g., no 2dsphere index or no drivers), fallback
            console.log('Geospatial query failed, falling back to any available driver:', geoErr.message);
            nearestDriver = await Driver.findOne({ isAvailable: true });
        }
        
        const booking = new Booking({
            passengerId: req.user.id,
            driverId: nearestDriver ? nearestDriver._id : undefined,
            pickupLocation,
            dropoffLocation,
            fare,
            status: nearestDriver ? 'accepted' : 'pending'
        });
        
        await booking.save();
        
        // If a driver was found, mark them as unavailable
        if (nearestDriver) {
            nearestDriver.isAvailable = false;
            await nearestDriver.save();
            
            // Emit ride request to the driver (by room and by direct socketId as fallback)
            const io = req.app.get('io');
            if (io) {
                const roomName = `driver_${nearestDriver.userId}`;
                io.to(roomName).emit('rideRequest', booking);
                console.log(`Emitted rideRequest to room: ${roomName}`);
                // Also emit directly via stored socketId
                if (nearestDriver.socketId) {
                    io.to(nearestDriver.socketId).emit('rideRequest', booking);
                    console.log(`Emitted rideRequest directly to socketId: ${nearestDriver.socketId}`);
                }
            }
        }
        
        res.status(201).json({
            message: nearestDriver ? 'Ride booked — driver assigned!' : 'Ride booked — waiting for driver',
            bookingId: booking._id,
            driverAssigned: !!nearestDriver,
            driverId: nearestDriver ? nearestDriver.userId : null
        });
    } catch (err) {
        console.error('Book ride error:', err);
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Get booking details
router.get('/book/:id', verifyToken, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
            .populate('driverId');
        
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }
        
        res.status(200).json({ booking });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Get all bookings for current user
router.get('/my-bookings', verifyToken, async (req, res) => {
    try {
        const bookings = await Booking.find({ passengerId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(20);
        res.status(200).json({ bookings });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Update driver location via REST (alternative to socket)
router.put('/location', verifyToken, async (req, res) => {
    try {
        const { lat, lng } = req.body;
        
        const driver = await Driver.findOneAndUpdate(
            { userId: req.user.id },
            {
                location: {
                    type: 'Point',
                    coordinates: [lng, lat]
                },
                lastLocationUpdate: new Date()
            },
            { new: true }
        );
        
        if (!driver) {
            return res.status(404).json({ message: 'Driver profile not found' });
        }
        
        res.status(200).json({ message: 'Location updated', coords: { lat, lng } });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Cancel a ride
router.put('/cancel/:id', verifyToken, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }
        
        booking.status = 'cancelled';
        await booking.save();
        
        // If a driver was assigned, make them available again
        if (booking.driverId) {
            await Driver.findByIdAndUpdate(booking.driverId, { isAvailable: true });
        }
        
        res.status(200).json({ message: 'Ride cancelled successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Accept a ride
router.put('/accept/:id', verifyToken, async (req, res) => {
    try {
        if (req.user.role !== 'driver') {
            return res.status(403).json({ message: 'Only drivers can accept rides' });
        }

        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }

        if (['completed', 'cancelled'].includes(booking.status)) {
            return res.status(409).json({ message: `This ride is already ${booking.status}` });
        }
        
        let driver = await Driver.findOne({ userId: req.user.id });
        if (!driver) {
            driver = await Driver.create({
                userId: req.user.id,
                isAvailable: true,
                vehicleDetails: 'Not specified'
            });
        }

        const alreadyAssignedToAnotherDriver =
            booking.driverId && booking.driverId.toString() !== driver._id.toString();

        if (alreadyAssignedToAnotherDriver) {
            return res.status(409).json({ message: 'This ride has already been accepted by another driver' });
        }
        
        booking.driverId = driver._id;
        booking.status = 'accepted';
        await booking.save();
        
        // Mark driver as unavailable
        driver.isAvailable = false;
        await driver.save();
        
        // Notify passenger via socket.io
        const io = req.app.get('io');
        if (io) {
            io.to(`ride_${booking._id.toString()}`).emit('rideAccepted', {
                bookingId: booking._id.toString(),
                driverId: req.user.id,
                status: 'accepted'
            });
        }
        
        res.status(200).json({ message: 'Ride accepted successfully', booking });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Complete a ride
router.put('/complete/:id', verifyToken, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ message: 'Booking not found' });
        }
        
        booking.status = 'completed';
        await booking.save();
        
        // Make driver available again
        if (booking.driverId) {
            await Driver.findByIdAndUpdate(booking.driverId, { isAvailable: true });
        }
        
        // Notify passenger via socket.io
        const io = req.app.get('io');
        if (io) {
            io.to(`ride_${booking._id.toString()}`).emit('rideCompleted', {
                bookingId: booking._id.toString(),
                status: 'completed'
            });
        }
        
        res.status(200).json({ message: 'Ride completed successfully', booking });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

module.exports = router;
