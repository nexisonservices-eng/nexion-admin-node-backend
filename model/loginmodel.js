// models/User.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      
    },
    email: {
      type: String,
    },
    password: {
      type: String,
    },
    
    twilioid:{
      type:String
    },
    whatsappid:{
      type:String
    },
    whatsapptoken:{
      type:String
    },
    whatsappbussiness:{
      type:String
    },

    resetPasswordToken: {
  type: String,
},
resetPasswordExpires: {
  type: Date,
},

  role: {
      type: String,
      enum: ["user", "admin","superadmin"],
      default: "user", 
    },

  },
  { timestamps: true }
);

module.exports = mongoose.model("admin", UserSchema);