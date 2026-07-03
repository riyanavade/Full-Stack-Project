const Razorpay = require('razorpay');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');

const createRazorpayClient = () => {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        throw new Error('Razorpay keys are not configured');
    }

    return new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
};

const compareSignatures = (generatedSignature, receivedSignature) => {
    const generated = Buffer.from(generatedSignature, 'hex');
    const received = Buffer.from(receivedSignature || '', 'hex');

    return generated.length === received.length && crypto.timingSafeEqual(generated, received);
};

/**
 * @route   POST /api/payment/create-order
 * @desc    Creates a Razorpay order before payment
 * @access  Private (User)
 */
exports.createOrder = async (req, res) => {
    try {
        const { rideId } = req.body;

        if (!rideId) {
            return res.status(400).json({ message: 'Ride ID is required' });
        }

        // Fetch ride details to get the exact fare
        const ride = await Booking.findById(rideId);
        if (!ride) {
            return res.status(404).json({ message: 'Ride not found' });
        }

        if (ride.passengerId.toString() !== req.user.id) {
            return res.status(403).json({ message: 'You can only pay for your own ride' });
        }

        if (ride.status !== 'completed') {
            return res.status(400).json({ message: 'Payment is allowed only after ride completion' });
        }

        if (ride.paymentStatus === 'paid') {
            return res.status(409).json({ message: 'This ride has already been paid' });
        }

        // Razorpay expects amount in the smallest currency unit (paise)
        // Ensure fare is valid before proceeding
        if (!ride.fare || ride.fare <= 0) {
             return res.status(400).json({ message: 'Invalid ride fare' });
        }
        
        const amount = Math.round(ride.fare * 100); 

        const options = {
            amount,
            currency: 'INR',
            receipt: `ride_${rideId}`.slice(0, 40),
            notes: {
                rideId,
                userId: req.user.id
            }
        };

        // Call Razorpay API to create order
        const razorpay = createRazorpayClient();
        const order = await razorpay.orders.create(options);

        if (!order) {
            return res.status(500).json({ message: 'Some error occurred while creating order' });
        }

        // Create initial pending payment record in database
        const newPayment = new Payment({
            user: req.user.id, // Set by authentication middleware
            ride: rideId,
            razorpayOrderId: order.id,
            amount: amount,
            currency: 'INR',
            paymentStatus: 'Pending'
        });

        await newPayment.save();

        res.status(200).json({
            keyId: process.env.RAZORPAY_KEY_ID,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            rideId,
        });

    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * @route   POST /api/payment/verify
 * @desc    Verifies Razorpay payment signature
 * @access  Private (User)
 */
exports.verifyPayment = async (req, res) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({ message: 'Payment verification details are required' });
        }

        const existingPayment = await Payment.findOne({
            razorpayOrderId,
            user: req.user.id
        });

        if (!existingPayment) {
            return res.status(404).json({ message: 'Payment record not found' });
        }

        // Create the expected signature using our secret
        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest('hex');

        // Verify if signatures match
        if (!compareSignatures(generatedSignature, razorpaySignature)) {
             // If they don't match, update the payment record as failed
             await Payment.findOneAndUpdate(
                 { razorpayOrderId, user: req.user.id },
                 { paymentStatus: 'Failed' }
             );
             await Booking.findByIdAndUpdate(existingPayment.ride, { paymentStatus: 'failed' });
            return res.status(400).json({ message: 'Payment verification failed' });
        }

        // Signatures match, payment is legitimate
        const payment = await Payment.findOneAndUpdate(
            { razorpayOrderId, user: req.user.id },
            { 
                razorpayPaymentId,
                paymentStatus: 'Paid' 
            },
            { new: true } // Return the updated document
        );

        await Booking.findByIdAndUpdate(payment.ride, {
            paymentStatus: 'paid',
            razorpayPaymentId
        });

        res.status(200).json({ 
            message: 'Payment verified successfully',
            payment 
        });

    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * @route   GET /api/payment/history
 * @desc    Get user's payment history
 * @access  Private (User)
 */
exports.getPaymentHistory = async (req, res) => {
    try {
        // Fetch payments for the logged in user, populate ride details
        const payments = await Payment.find({ user: req.user.id })
            .populate('ride')
            .sort({ createdAt: -1 });

        res.status(200).json(payments);
    } catch (error) {
        console.error('Error fetching payment history:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
