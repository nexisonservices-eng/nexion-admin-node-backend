const Company = require("../model/company");
const User = require("../model/loginmodel");
const Payment = require("../model/payment");
const Subscription = require("../model/subscription");

const getCompanies = async (req, res) => {
  try {
    const companies = await Company.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: companies });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch companies", error: error.message });
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users", error: error.message });
  }
};

const getPayments = async (req, res) => {
  try {
    const payments = await Payment.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch payments", error: error.message });
  }
};

const getSubscriptions = async (req, res) => {
  try {
    const subscriptions = await Subscription.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: subscriptions });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch subscriptions", error: error.message });
  }
};

const disableCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const company = await Company.findByIdAndUpdate(
      id,
      { status: "disabled" },
      { new: true }
    );
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }
    res.json({ success: true, data: company });
  } catch (error) {
    res.status(500).json({ message: "Failed to disable company", error: error.message });
  }
};

module.exports = {
  getCompanies,
  getUsers,
  getPayments,
  getSubscriptions,
  disableCompany
};
