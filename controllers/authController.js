const { User } = require('../models');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

exports.register = async (req, res) => {
  try {
    const { role, name, email, password, companyName, truckType, truckCapacity, licenseNumber } = req.body;

    const userExists = await User.findOne({ where: { email } });
    if (userExists) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      role,
      name,
      email,
      password: hashedPassword,
      companyName: role === 'company' ? companyName : null,
      truckType: role === 'driver' ? truckType : null,
      truckCapacity: role === 'driver' ? truckCapacity : null,
      licenseNumber: role === 'driver' ? licenseNumber : null
    });

    res.status(201).json({
      success: true,
      token: generateToken(user.id),
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        email: user.email
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide email and password' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    res.status(200).json({
      success: true,
      token: generateToken(user.id),
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        email: user.email
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, companyName, phone, email } = req.body;
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    if (name)        user.name        = name;
    if (companyName) user.companyName = companyName;
    if (phone)       user.phone       = phone;
    // Only update email if it changed and isn't already taken
    if (email && email !== user.email) {
      const exists = await User.findOne({ where: { email } });
      if (exists) return res.status(400).json({ success: false, error: 'Email already in use' });
      user.email = email;
    }

    await user.save();
    // Refresh localStorage payload on the client side
    const fresh = await User.findByPk(req.user.id, { attributes: { exclude: ['password'] } });
    res.status(200).json({ success: true, data: fresh });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

