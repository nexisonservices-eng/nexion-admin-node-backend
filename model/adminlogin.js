const mongoose = require("mongoose");

const loginschema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user", 
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, 
    createdByName: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", loginschema);
