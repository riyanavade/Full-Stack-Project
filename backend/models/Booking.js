const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    passengerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
    pickupLocation: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        address: { type: String }
    },
    dropoffLocation: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        address: { type: String }
    },
    status: { type: String, enum: ['pending', 'accepted', 'completed', 'cancelled'], default: 'pending' },
    fare: { type: Number, required: true },
    paymentStatus: { type: String, enum: ['unpaid', 'paid', 'failed'], default: 'unpaid' },
    razorpayPaymentId: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
